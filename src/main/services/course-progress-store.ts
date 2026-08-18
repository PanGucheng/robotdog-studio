import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { CourseLesson, CourseOperationKind, CourseProgressSnapshot, CourseProgressUpdate, WorkspaceSummary } from '../../shared/types'

const workspaceIdSchema = z.string().regex(/^ws_[a-f0-9]{24}$/)
const operationSchema = z.object({
  state: z.enum(['not-run', 'passed', 'failed', 'stale']),
  checkedAt: z.string().datetime().optional(),
  detail: z.string().max(240).optional()
}).strict()
const progressContractSchema = z.object({
  schemaVersion: z.literal(1),
  contentVersion: z.number().int().positive(),
  steps: z.array(z.object({
    stepId: z.string().min(1).max(96),
    type: z.string().min(1).max(64),
    questionId: z.string().min(1).max(96).optional()
  }).strict()),
  completionChecks: z.array(z.object({
    type: z.string().min(1).max(96),
    target: z.string().min(1).max(240).optional()
  }).strict())
}).strict()
const storedProgressFields = {
  workspaceId: workspaceIdSchema,
  courseId: z.string().min(1).max(96),
  lessonId: z.string().min(1).max(96),
  contentVersion: z.number().int().positive(),
  steps: z.array(z.object({ stepId: z.string().min(1).max(96), completed: z.boolean(), completedAt: z.string().datetime().optional() }).strict()),
  answers: z.record(z.string(), z.string().max(2_000)),
  observations: z.record(z.string(), z.string().max(2_000)),
  appliedFiles: z.array(z.string().min(1).max(240)).default([]),
  operations: z.object({
    'candidate-build': operationSchema,
    'firmware-build': operationSchema,
    flash: operationSchema
  }).strict(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional()
} as const
const storedProgressV1Schema = z.object({
  schemaVersion: z.literal(1),
  ...storedProgressFields
}).strict()
const storedProgressSchema = z.object({
  schemaVersion: z.literal(2),
  contract: progressContractSchema,
  ...storedProgressFields
}).strict()
const updateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('step'), stepId: z.string().min(1).max(96), completed: z.boolean() }).strict(),
  z.object({ kind: z.literal('answer'), questionId: z.string().min(1).max(96), answer: z.string().max(2_000) }).strict(),
  z.object({ kind: z.literal('observation'), stepId: z.string().min(1).max(96), observation: z.string().max(2_000) }).strict()
])

type StoredProgress = z.infer<typeof storedProgressSchema>
type StoredProgressV1 = z.infer<typeof storedProgressV1Schema>

export class CourseProgressStore {
  private readonly rootDir: string
  private readonly queues = new Map<string, Promise<void>>()

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir)
  }

  async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
  }

  async get(workspace: WorkspaceSummary, lesson: CourseLesson, existingFiles: string[] = []): Promise<CourseProgressSnapshot> {
    return this.serialize(workspace.id, () => this.getUnlocked(workspace, lesson, existingFiles))
  }

  private async getUnlocked(workspace: WorkspaceSummary, lesson: CourseLesson, existingFiles: string[]): Promise<CourseProgressSnapshot> {
    const { stored, recoveredFromCorruption } = await this.readOrCreate(workspace, lesson)
    const synchronized = this.synchronizeSteps(stored)
    if (JSON.stringify(synchronized.steps) !== JSON.stringify(stored.steps)) await this.write(synchronized)
    return this.toSnapshot(synchronized, lesson, existingFiles, recoveredFromCorruption)
  }

  async update(workspace: WorkspaceSummary, lesson: CourseLesson, input: CourseProgressUpdate, existingFiles: string[] = []): Promise<CourseProgressSnapshot> {
    return this.serialize(workspace.id, () => this.updateUnlocked(workspace, lesson, input, existingFiles))
  }

  private async updateUnlocked(workspace: WorkspaceSummary, lesson: CourseLesson, input: CourseProgressUpdate, existingFiles: string[]): Promise<CourseProgressSnapshot> {
    const update = updateSchema.parse(input)
    const { stored } = await this.readOrCreate(workspace, lesson)
    const next = this.synchronizeSteps(stored)
    const now = new Date().toISOString()
    if (update.kind === 'step') {
      const target = next.contract.steps.find((step) => step.stepId === update.stepId)
      if (!target) throw new Error('COURSE_PROGRESS_STEP_NOT_FOUND')
      if (!['read', 'summary'].includes(target.type)) throw new Error('COURSE_PROGRESS_STEP_AUTOMATIC')
      next.steps = next.steps.map((step) => step.stepId === update.stepId
        ? { stepId: step.stepId, completed: update.completed, completedAt: update.completed ? now : undefined }
        : step)
    } else if (update.kind === 'answer') {
      if (!next.contract.steps.some((step) => step.type === 'question' && step.questionId === update.questionId)) throw new Error('COURSE_PROGRESS_QUESTION_NOT_FOUND')
      const answer = update.answer.trim()
      if (answer) next.answers[update.questionId] = answer
      else delete next.answers[update.questionId]
      const questionStepId = next.contract.steps.find((step) => step.type === 'question' && step.questionId === update.questionId)?.stepId
      if (!questionStepId) throw new Error('COURSE_PROGRESS_QUESTION_STEP_NOT_FOUND')
      next.steps = this.markStep(next.steps, questionStepId, Boolean(answer), now)
    } else if (update.kind === 'observation') {
      const target = next.contract.steps.find((step) => step.stepId === update.stepId)
      if (!target || !['serial-observation', 'hardware-observation'].includes(target.type)) throw new Error('COURSE_PROGRESS_OBSERVATION_NOT_FOUND')
      const observation = update.observation.trim()
      if (observation) next.observations[update.stepId] = observation
      else delete next.observations[update.stepId]
      next.steps = next.steps.map((step) => step.stepId === update.stepId
        ? { stepId: step.stepId, completed: Boolean(observation), completedAt: observation ? now : undefined }
        : step)
    }
    next.updatedAt = now
    const snapshot = this.toSnapshot(next, lesson, existingFiles)
    next.completedAt = snapshot.state === 'completed' ? next.completedAt ?? now : undefined
    await this.write(next)
    return this.toSnapshot(next, lesson, existingFiles)
  }

  async getCompletedLegacyLectureSectionIds(workspace: WorkspaceSummary, lesson: CourseLesson): Promise<string[]> {
    if (workspace.courseBinding?.contentVersion !== 3) return []
    return this.serialize(workspace.id, async () => {
      const { stored } = await this.readOrCreate(workspace, lesson)
      const completed = new Set(stored.steps.filter((step) => step.completed).map((step) => step.stepId))
      return lesson.steps.flatMap((step) => stored.contract.steps.some((contractStep) => contractStep.stepId === step.stepId && contractStep.type === 'read')
        && completed.has(step.stepId) && step.lectureSectionId ? [step.lectureSectionId] : [])
    })
  }

  async recordOperation(workspace: WorkspaceSummary, lesson: CourseLesson, kind: CourseOperationKind, passed: boolean, detail?: string, existingFiles: string[] = []): Promise<CourseProgressSnapshot> {
    return this.serialize(workspace.id, () => this.recordOperationUnlocked(workspace, lesson, kind, passed, detail, existingFiles))
  }

  private async recordOperationUnlocked(workspace: WorkspaceSummary, lesson: CourseLesson, kind: CourseOperationKind, passed: boolean, detail: string | undefined, existingFiles: string[]): Promise<CourseProgressSnapshot> {
    const { stored } = await this.readOrCreate(workspace, lesson)
    const next = this.synchronizeSteps(stored)
    const now = new Date().toISOString()
    next.operations[kind] = { state: passed ? 'passed' : 'failed', checkedAt: now, detail: detail?.slice(0, 240) }
    if (kind === 'firmware-build' && next.contract.steps.some((step) => step.type === 'candidate-build')) {
      next.operations['candidate-build'] = { state: passed ? 'passed' : 'failed', checkedAt: now, detail: passed ? '当前 Workspace 已通过完整 Compiler / Linker 构建。' : detail?.slice(0, 240) }
    }
    const stepType = kind === 'candidate-build' ? 'candidate-build' : kind === 'firmware-build' ? 'firmware-build' : 'flash'
    next.steps = next.steps.map((step) => next.contract.steps.find((item) => item.stepId === step.stepId)?.type === stepType
      ? passed ? { stepId: step.stepId, completed: true, completedAt: step.completedAt ?? now } : { stepId: step.stepId, completed: false }
      : step)
    if (kind === 'firmware-build') next.steps = next.steps.map((step) => next.contract.steps.find((item) => item.stepId === step.stepId)?.type === 'candidate-build'
      ? passed ? { stepId: step.stepId, completed: true, completedAt: step.completedAt ?? now } : { stepId: step.stepId, completed: false }
      : step)
    next.updatedAt = now
    const snapshot = this.toSnapshot(next, lesson, existingFiles)
    next.completedAt = snapshot.state === 'completed' ? next.completedAt ?? now : undefined
    await this.write(next)
    return this.toSnapshot(next, lesson, existingFiles)
  }

  async recordSourceChange(workspace: WorkspaceSummary, lesson: CourseLesson, kind: 'candidate-applied' | 'workspace-edited' | 'workspace-undone', changedFiles: string[] = [], existingFiles: string[] = []): Promise<CourseProgressSnapshot> {
    return this.serialize(workspace.id, async () => {
      const { stored } = await this.readOrCreate(workspace, lesson)
      const next = this.synchronizeSteps(stored)
      const now = new Date().toISOString()
      const invalidatedKinds: CourseOperationKind[] = kind === 'candidate-applied'
        ? ['firmware-build', 'flash']
        : ['candidate-build', 'firmware-build', 'flash']
      for (const operationKind of invalidatedKinds) {
        if (next.operations[operationKind].state === 'not-run') continue
        next.operations[operationKind] = { state: 'stale', checkedAt: now, detail: '学生代码已变化，请重新检查。' }
        const stepType = operationKind === 'candidate-build' ? 'candidate-build' : operationKind === 'firmware-build' ? 'firmware-build' : 'flash'
        next.steps = next.steps.map((step) => next.contract.steps.find((item) => item.stepId === step.stepId)?.type === stepType
          ? { stepId: step.stepId, completed: false }
          : step)
      }
      next.appliedFiles = kind === 'candidate-applied' || kind === 'workspace-edited'
        ? [...new Set([...next.appliedFiles, ...changedFiles])]
        : []
      next.steps = next.steps.map((step) => {
        const contractStep = next.contract.steps.find((item) => item.stepId === step.stepId)
        const lessonStep = lesson.steps.find((item) => item.stepId === step.stepId)
        if (kind === 'workspace-edited' && contractStep?.type === 'edit' && lessonStep?.fileTarget?.path && changedFiles.includes(lessonStep.fileTarget.path)) {
          return { stepId: step.stepId, completed: true, completedAt: step.completedAt ?? now }
        }
        if (contractStep?.type !== 'review-apply') return step
        return kind === 'candidate-applied' || kind === 'workspace-edited'
          ? { stepId: step.stepId, completed: true, completedAt: step.completedAt ?? now }
          : { stepId: step.stepId, completed: false }
      })
      next.updatedAt = now
      next.completedAt = undefined
      await this.write(next)
      return this.toSnapshot(next, lesson, existingFiles)
    })
  }

  private async readOrCreate(workspace: WorkspaceSummary, lesson: CourseLesson): Promise<{ stored: StoredProgress; recoveredFromCorruption?: boolean }> {
    this.requireCourseWorkspace(workspace, lesson)
    const path = this.pathFor(workspace.id)
    try {
      const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
      const current = storedProgressSchema.safeParse(raw)
      if (current.success) {
        this.requireStoredIdentity(current.data, workspace, lesson)
        return { stored: current.data }
      }
      const legacy = storedProgressV1Schema.safeParse(raw)
      if (!legacy.success) throw new Error('COURSE_PROGRESS_INVALID')
      this.requireStoredIdentity(legacy.data, workspace, lesson)
      if (legacy.data.contentVersion !== lesson.contentVersion && !lesson.progressCompatibleFrom.includes(legacy.data.contentVersion)) throw new Error('COURSE_PROGRESS_VERSION_UNSUPPORTED')
      const migrated = this.migrateLegacy(legacy.data, lesson)
      await this.write(migrated)
      return { stored: migrated }
    } catch (caught) {
      const code = caught as NodeJS.ErrnoException
      if (caught instanceof Error && caught.message === 'COURSE_PROGRESS_VERSION_UNSUPPORTED') throw caught
      if (code.code !== 'ENOENT') {
        const backup = `${path}.corrupt-${Date.now()}.bak`
        await rename(path, backup).catch(() => undefined)
      }
      const stored = this.createEmpty(workspace, lesson)
      await this.write(stored)
      return { stored, recoveredFromCorruption: code.code !== 'ENOENT' }
    }
  }

  private createEmpty(workspace: WorkspaceSummary, lesson: CourseLesson): StoredProgress {
    const now = new Date().toISOString()
    return {
      schemaVersion: 2,
      workspaceId: workspace.id,
      courseId: lesson.courseId,
      lessonId: lesson.lessonId,
      contentVersion: workspace.courseBinding!.contentVersion,
      contract: this.createContract(workspace.courseBinding!.contentVersion, lesson),
      steps: lesson.steps.map((step) => ({ stepId: step.stepId, completed: false })),
      answers: {}, observations: {}, appliedFiles: [],
      operations: { 'candidate-build': { state: 'not-run' }, 'firmware-build': { state: 'not-run' }, flash: { state: 'not-run' } },
      createdAt: now, updatedAt: now
    }
  }

  private synchronizeSteps(stored: StoredProgress): StoredProgress {
    const previous = new Map(stored.steps.map((step) => [step.stepId, step]))
    return { ...stored, steps: stored.contract.steps.map((step) => previous.get(step.stepId) ?? { stepId: step.stepId, completed: false }) }
  }

  private toSnapshot(stored: StoredProgress, lesson: CourseLesson, existingFiles: string[], recoveredFromCorruption?: boolean): CourseProgressSnapshot {
    const files = new Set(existingFiles)
    const checks = stored.contract.completionChecks.map((check) => {
      if (check.type === 'file-exists') return { ...check, passed: Boolean(check.target && files.has(check.target)), label: check.target ? `文件存在：${check.target}` : '指定文件存在' }
      if (check.type === 'student-change-applied') return { ...check, passed: check.target ? stored.appliedFiles.includes(check.target) : stored.appliedFiles.length > 0, label: check.target ? `已保存教学文件修改：${check.target}` : '已保存一次代码修改' }
      if (check.type === 'candidate-build-passed') return { ...check, passed: stored.operations['candidate-build'].state === 'passed', label: 'Workspace 编译与链接通过' }
      if (check.type === 'firmware-build-passed') return { ...check, passed: stored.operations['firmware-build'].state === 'passed', label: '完整程序生成成功' }
      if (check.type === 'flash-succeeded') return { ...check, passed: stored.operations.flash.state === 'passed', label: '最近一次烧录成功' }
      if (check.type === 'manual-observation-confirmed') return { ...check, passed: Boolean(check.target && stored.observations[check.target]?.trim()), label: check.target ? `已经记录观察：${check.target}` : '已经记录指定观察' }
      return { ...check, passed: Boolean(check.target && stored.answers[check.target]?.trim()), label: check.target ? `已回答：${check.target}` : '思考题已回答' }
    })
    const completedSteps = stored.steps.filter((step) => step.completed).length
    const hasAttentionOperation = Object.values(stored.operations).some((operation) => operation.state === 'failed' || operation.state === 'stale')
    const complete = completedSteps === stored.steps.length && checks.every((check) => check.passed)
    const changed = completedSteps > 0 || stored.appliedFiles.length > 0 || Object.keys(stored.answers).length > 0 || Object.keys(stored.observations).length > 0 || Object.values(stored.operations).some((operation) => operation.state !== 'not-run')
    const state = complete ? 'completed' : hasAttentionOperation ? 'needs-attention' : changed ? 'in-progress' : 'not-started'
    const { contract: _contract, schemaVersion: _storedSchemaVersion, ...progress } = stored
    return {
      ...progress, schemaVersion: 1, checks, completedSteps, totalSteps: stored.steps.length,
      completionPercent: stored.steps.length ? Math.round((completedSteps / stored.steps.length) * 100) : 0,
      state, completedAt: complete ? stored.completedAt : undefined, recoveredFromCorruption
    }
  }

  private createContract(contentVersion: number, lesson: CourseLesson): StoredProgress['contract'] {
    return {
      schemaVersion: 1,
      contentVersion,
      steps: lesson.steps.map(({ stepId, type, questionId }) => ({ stepId, type, ...(questionId ? { questionId } : {}) })),
      completionChecks: lesson.completionChecks.map(({ type, target }) => ({ type, ...(target ? { target } : {}) }))
    }
  }

  private migrateLegacy(legacy: StoredProgressV1, lesson: CourseLesson): StoredProgress {
    return {
      ...legacy,
      schemaVersion: 2,
      contract: this.createContract(legacy.contentVersion, lesson)
    }
  }

  private requireStoredIdentity(stored: Pick<StoredProgress, 'workspaceId' | 'courseId' | 'lessonId'>, workspace: WorkspaceSummary, lesson: CourseLesson): void {
    if (stored.workspaceId !== workspace.id || stored.courseId !== lesson.courseId || stored.lessonId !== lesson.lessonId) throw new Error('COURSE_PROGRESS_INVALID')
  }

  private markStep(steps: StoredProgress['steps'], target: string, completed: boolean, now: string): StoredProgress['steps'] {
    return steps.map((step) => step.stepId === target ? { stepId: step.stepId, completed, completedAt: completed ? now : undefined } : step)
  }

  private requireCourseWorkspace(workspace: WorkspaceSummary, lesson: CourseLesson): void {
    workspaceIdSchema.parse(workspace.id)
    if (workspace.workspacePurpose !== 'mcu-lesson-attempt' || !workspace.courseBinding) throw new Error('COURSE_PROGRESS_WORKSPACE_REQUIRED')
    if (workspace.courseBinding.courseId !== lesson.courseId || workspace.courseBinding.lessonId !== lesson.lessonId) throw new Error('COURSE_PROGRESS_BINDING_MISMATCH')
  }

  private pathFor(workspaceId: string): string {
    return join(this.rootDir, `${workspaceIdSchema.parse(workspaceId)}.json`)
  }

  private async write(progress: StoredProgress): Promise<void> {
    const path = this.pathFor(progress.workspaceId)
    const temporary = `${path}.tmp`
    await writeFile(temporary, `${JSON.stringify(progress, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }

  private async serialize<T>(workspaceId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(workspaceId) ?? Promise.resolve()
    let release = (): void => undefined
    const current = new Promise<void>((resolveQueue) => { release = resolveQueue })
    this.queues.set(workspaceId, current)
    await previous.catch(() => undefined)
    try {
      return await task()
    } finally {
      release()
      if (this.queues.get(workspaceId) === current) this.queues.delete(workspaceId)
    }
  }
}
