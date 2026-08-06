import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { CourseLesson, CourseOperationKind, CourseProgressSnapshot, CourseProgressUpdate, WorkspaceSummary } from '../../shared/types'

const workspaceIdSchema = z.string().regex(/^ws_[a-f0-9]{24}$/)
const operationSchema = z.object({
  state: z.enum(['not-run', 'passed', 'failed']),
  checkedAt: z.string().datetime().optional(),
  detail: z.string().max(240).optional()
}).strict()
const storedProgressSchema = z.object({
  schemaVersion: z.literal(1),
  workspaceId: workspaceIdSchema,
  courseId: z.string().min(1).max(96),
  lessonId: z.string().min(1).max(96),
  contentVersion: z.number().int().positive(),
  steps: z.array(z.object({ stepId: z.string().min(1).max(96), completed: z.boolean(), completedAt: z.string().datetime().optional() }).strict()),
  answers: z.record(z.string(), z.string().max(2_000)),
  observations: z.record(z.string(), z.string().max(2_000)),
  operations: z.object({
    'candidate-build': operationSchema,
    'firmware-build': operationSchema,
    flash: operationSchema
  }).strict(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional()
}).strict()
const updateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('step'), stepId: z.string().min(1).max(96), completed: z.boolean() }).strict(),
  z.object({ kind: z.literal('answer'), questionId: z.string().min(1).max(96), answer: z.string().max(2_000) }).strict(),
  z.object({ kind: z.literal('observation'), stepId: z.string().min(1).max(96), observation: z.string().max(2_000) }).strict()
])

type StoredProgress = z.infer<typeof storedProgressSchema>

export class CourseProgressStore {
  private readonly rootDir: string

  constructor(rootDir: string) {
    this.rootDir = resolve(rootDir)
  }

  async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
  }

  async get(workspace: WorkspaceSummary, lesson: CourseLesson, existingFiles: string[] = []): Promise<CourseProgressSnapshot> {
    const { stored, recoveredFromCorruption } = await this.readOrCreate(workspace, lesson)
    const synchronized = this.synchronizeSteps(stored, lesson)
    if (JSON.stringify(synchronized.steps) !== JSON.stringify(stored.steps)) await this.write(synchronized)
    return this.toSnapshot(synchronized, lesson, existingFiles, recoveredFromCorruption)
  }

  async update(workspace: WorkspaceSummary, lesson: CourseLesson, input: CourseProgressUpdate, existingFiles: string[] = []): Promise<CourseProgressSnapshot> {
    const update = updateSchema.parse(input)
    const { stored } = await this.readOrCreate(workspace, lesson)
    const next = this.synchronizeSteps(stored, lesson)
    const now = new Date().toISOString()
    if (update.kind === 'step') {
      if (!lesson.steps.some((step) => step.stepId === update.stepId)) throw new Error('COURSE_PROGRESS_STEP_NOT_FOUND')
      next.steps = next.steps.map((step) => step.stepId === update.stepId
        ? { stepId: step.stepId, completed: update.completed, completedAt: update.completed ? now : undefined }
        : step)
    } else if (update.kind === 'answer') {
      if (!lesson.reflectionQuestions.some((question) => question.questionId === update.questionId)) throw new Error('COURSE_PROGRESS_QUESTION_NOT_FOUND')
      const answer = update.answer.trim()
      if (answer) next.answers[update.questionId] = answer
      else delete next.answers[update.questionId]
      next.steps = this.markFirstStepOfType(next.steps, lesson, 'question', Boolean(answer), now)
    } else {
      const target = lesson.steps.find((step) => step.stepId === update.stepId)
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

  async recordOperation(workspace: WorkspaceSummary, lesson: CourseLesson, kind: CourseOperationKind, passed: boolean, detail?: string, existingFiles: string[] = []): Promise<CourseProgressSnapshot> {
    const { stored } = await this.readOrCreate(workspace, lesson)
    const next = this.synchronizeSteps(stored, lesson)
    const now = new Date().toISOString()
    next.operations[kind] = { state: passed ? 'passed' : 'failed', checkedAt: now, detail: detail?.slice(0, 240) }
    const stepType = kind === 'candidate-build' ? 'candidate-build' : kind === 'firmware-build' ? 'firmware-build' : 'flash'
    if (passed) next.steps = next.steps.map((step) => lesson.steps.find((item) => item.stepId === step.stepId)?.type === stepType
      ? { stepId: step.stepId, completed: true, completedAt: step.completedAt ?? now }
      : step)
    next.updatedAt = now
    const snapshot = this.toSnapshot(next, lesson, existingFiles)
    next.completedAt = snapshot.state === 'completed' ? next.completedAt ?? now : undefined
    await this.write(next)
    return this.toSnapshot(next, lesson, existingFiles)
  }

  private async readOrCreate(workspace: WorkspaceSummary, lesson: CourseLesson): Promise<{ stored: StoredProgress; recoveredFromCorruption?: boolean }> {
    this.requireCourseWorkspace(workspace, lesson)
    const path = this.pathFor(workspace.id)
    try {
      const parsed = storedProgressSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
      if (!parsed.success || parsed.data.workspaceId !== workspace.id || parsed.data.courseId !== lesson.courseId || parsed.data.lessonId !== lesson.lessonId) throw new Error('COURSE_PROGRESS_INVALID')
      return { stored: parsed.data }
    } catch (caught) {
      const code = caught as NodeJS.ErrnoException
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
      schemaVersion: 1,
      workspaceId: workspace.id,
      courseId: lesson.courseId,
      lessonId: lesson.lessonId,
      contentVersion: workspace.courseBinding!.contentVersion,
      steps: lesson.steps.map((step) => ({ stepId: step.stepId, completed: false })),
      answers: {}, observations: {},
      operations: { 'candidate-build': { state: 'not-run' }, 'firmware-build': { state: 'not-run' }, flash: { state: 'not-run' } },
      createdAt: now, updatedAt: now
    }
  }

  private synchronizeSteps(stored: StoredProgress, lesson: CourseLesson): StoredProgress {
    const previous = new Map(stored.steps.map((step) => [step.stepId, step]))
    return { ...stored, steps: lesson.steps.map((step) => previous.get(step.stepId) ?? { stepId: step.stepId, completed: false }) }
  }

  private toSnapshot(stored: StoredProgress, lesson: CourseLesson, existingFiles: string[], recoveredFromCorruption?: boolean): CourseProgressSnapshot {
    const files = new Set(existingFiles)
    const checks = lesson.completionChecks.map((check) => {
      if (check.type === 'file-exists') return { ...check, passed: Boolean(check.target && files.has(check.target)), label: check.target ? `文件存在：${check.target}` : '指定文件存在' }
      if (check.type === 'candidate-build-passed') return { ...check, passed: stored.operations['candidate-build'].state === 'passed', label: '候选代码编译通过' }
      if (check.type === 'firmware-build-passed') return { ...check, passed: stored.operations['firmware-build'].state === 'passed', label: '完整程序生成成功' }
      if (check.type === 'flash-succeeded') return { ...check, passed: stored.operations.flash.state === 'passed', label: '最近一次烧录成功' }
      if (check.type === 'manual-observation-confirmed') return { ...check, passed: Object.values(stored.observations).some(Boolean), label: '已经记录人工观察' }
      return { ...check, passed: Boolean(check.target && stored.answers[check.target]?.trim()), label: check.target ? `已回答：${check.target}` : '思考题已回答' }
    })
    const completedSteps = stored.steps.filter((step) => step.completed).length
    const hasFailedOperation = Object.values(stored.operations).some((operation) => operation.state === 'failed')
    const complete = completedSteps === stored.steps.length && checks.every((check) => check.passed)
    const changed = completedSteps > 0 || Object.keys(stored.answers).length > 0 || Object.keys(stored.observations).length > 0 || Object.values(stored.operations).some((operation) => operation.state !== 'not-run')
    const state = complete ? 'completed' : hasFailedOperation ? 'needs-attention' : changed ? 'in-progress' : 'not-started'
    return {
      ...stored, checks, completedSteps, totalSteps: stored.steps.length,
      completionPercent: stored.steps.length ? Math.round((completedSteps / stored.steps.length) * 100) : 0,
      state, completedAt: complete ? stored.completedAt : undefined, recoveredFromCorruption
    }
  }

  private markFirstStepOfType(steps: StoredProgress['steps'], lesson: CourseLesson, type: CourseLesson['steps'][number]['type'], completed: boolean, now: string): StoredProgress['steps'] {
    const target = lesson.steps.find((step) => step.type === type)?.stepId
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
}
