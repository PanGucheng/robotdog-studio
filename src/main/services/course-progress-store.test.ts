import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { CourseLesson, WorkspaceSummary } from '../../shared/types'
import { CourseProgressStore } from './course-progress-store'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

function workspace(): WorkspaceSummary {
  const now = new Date().toISOString()
  return {
    id: 'ws_0123456789abcdef01234567', name: '第一课 · 第 1 次', studentDisplayName: '测试同学', learningPath: 'mcu-foundations',
    platform: 'wch-ch32v203', target: 'CH32V203C8T6', toolchainProfile: 'wch-gcc12-openocd',
    workspacePurpose: 'mcu-lesson-attempt', templateId: 'lesson-one', templateVersion: 'content-v1',
    courseBinding: { courseId: 'course-one', lessonId: 'lesson-one', contentVersion: 1, attemptNumber: 1 },
    firmwareBaselineId: 'baseline', baselineCommit: 'a'.repeat(40), createdAt: now, headCommit: 'b'.repeat(40), state: 'ready', updatedAt: now
  }
}

function lesson(): CourseLesson {
  return {
    courseId: 'course-one', contentVersion: 1, progressCompatibleFrom: [], learningCompatibleFrom: [], lessonId: 'lesson-one', title: '第一课', summary: '测试课程进度', estimatedMinutes: 45,
    hardware: 'none', verification: 'not-required', status: 'published', prerequisites: [], order: 0,
    objectives: ['完成一次练习'], expectedObservation: '编译成功', templateId: 'lesson-one', editableGlobs: ['App/**'], readableFiles: [], deniedGlobs: [],
    steps: [
      { stepId: 'read-entry', type: 'read', title: '阅读', instruction: '阅读入口' },
      { stepId: 'candidate-build', type: 'candidate-build', title: '预检', instruction: '运行预检' },
      { stepId: 'firmware-build', type: 'firmware-build', title: '构建', instruction: '生成程序' },
      { stepId: 'reflect', type: 'question', questionId: 'build-versus-flash', title: '思考', instruction: '回答问题' }
    ],
    completionChecks: [
      { type: 'file-exists', target: 'App/Src/experiment.c' },
      { type: 'candidate-build-passed' }, { type: 'firmware-build-passed' }, { type: 'question-answered', target: 'build-versus-flash' }
    ],
    reflectionQuestions: [{ questionId: 'build-versus-flash', prompt: '有什么区别？' }],
    aiContext: { teachingFocus: '测试', hints: [] }
  }
}

async function fixture(): Promise<{ store: CourseProgressStore; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'robotdog-course-progress-'))
  roots.push(root)
  const store = new CourseProgressStore(join(root, 'course-progress'))
  await store.initialize()
  return { store, root }
}

describe('CourseProgressStore', () => {
  it('persists manual steps and answers outside the workspace project', async () => {
    const { store, root } = await fixture()
    await store.update(workspace(), lesson(), { kind: 'step', stepId: 'read-entry', completed: true }, ['App/Src/experiment.c'])
    const result = await store.update(workspace(), lesson(), { kind: 'answer', questionId: 'build-versus-flash', answer: '编译生成程序，烧录才写入芯片。' }, ['App/Src/experiment.c'])
    expect(result.completedSteps).toBe(2)
    expect(result.answers['build-versus-flash']).toContain('烧录')
    expect(await readFile(join(root, 'course-progress', `${workspace().id}.json`), 'utf8')).toContain('build-versus-flash')
  })

  it('records build results, completes matching steps, and computes completion', async () => {
    const { store } = await fixture()
    const files = ['App/Src/experiment.c']
    await store.update(workspace(), lesson(), { kind: 'step', stepId: 'read-entry', completed: true }, files)
    await store.update(workspace(), lesson(), { kind: 'answer', questionId: 'build-versus-flash', answer: '两者发生在不同阶段。' }, files)
    await store.recordOperation(workspace(), lesson(), 'candidate-build', true, '编译通过', files)
    const completed = await store.recordOperation(workspace(), lesson(), 'firmware-build', true, '固件生成成功', files)
    expect(completed.state).toBe('completed')
    expect(completed.completionPercent).toBe(100)
    expect(completed.checks.every((check) => check.passed)).toBe(true)
    expect(completed.completedAt).toBeTruthy()
  })

  it('bridges direct Workspace saves and full builds into legacy course evidence', async () => {
    const { store } = await fixture()
    const legacy = lesson()
    legacy.steps.splice(1, 0,
      { stepId: 'edit-code', type: 'edit', title: '修改', instruction: '修改代码', fileTarget: { path: 'App/Src/experiment.c' } },
      { stepId: 'review-change', type: 'review-apply', title: '保存', instruction: '旧版保存步骤' })
    legacy.completionChecks.splice(1, 0, { type: 'student-change-applied', target: 'App/Src/experiment.c' })
    const files = ['App/Src/experiment.c']

    const saved = await store.recordSourceChange(workspace(), legacy, 'workspace-edited', ['App/Src/experiment.c'], files)
    expect(saved.steps.find((step) => step.stepId === 'edit-code')?.completed).toBe(true)
    expect(saved.steps.find((step) => step.stepId === 'review-change')?.completed).toBe(true)
    const built = await store.recordOperation(workspace(), legacy, 'firmware-build', true, '完整构建通过', files)
    expect(built.operations['candidate-build'].state).toBe('passed')
    expect(built.steps.find((step) => step.stepId === 'candidate-build')?.completed).toBe(true)
    expect(built.checks.find((check) => check.type === 'candidate-build-passed')?.passed).toBe(true)
  })

  it('rejects manual completion for steps owned by trusted system evidence', async () => {
    const { store } = await fixture()
    await expect(store.update(workspace(), lesson(), { kind: 'step', stepId: 'candidate-build', completed: true }))
      .rejects.toThrow('COURSE_PROGRESS_STEP_AUTOMATIC')
  })

  it('does not accept a claimed edit without a Workspace write', async () => {
    const { store } = await fixture()
    const current = lesson()
    current.steps.splice(1, 0, { stepId: 'edit-code', type: 'edit', title: '修改', instruction: '修改代码', fileTarget: { path: 'App/Src/experiment.c' } })
    await expect(store.update(workspace(), current, { kind: 'step', stepId: 'edit-code', completed: true }))
      .rejects.toThrow('COURSE_PROGRESS_STEP_AUTOMATIC')
  })

  it('backs up damaged progress and recreates an empty snapshot', async () => {
    const { store, root } = await fixture()
    await store.get(workspace(), lesson())
    const progressPath = join(root, 'course-progress', `${workspace().id}.json`)
    await writeFile(progressPath, '{ damaged', 'utf8')
    const recovered = await store.get(workspace(), lesson())
    expect(recovered.recoveredFromCorruption).toBe(true)
    expect(recovered.state).toBe('not-started')
    expect((await readdir(join(root, 'course-progress'))).some((name) => name.includes('.corrupt-'))).toBe(true)
  })

  it('marks a failed operation as needing attention', async () => {
    const { store } = await fixture()
    await store.recordOperation(workspace(), lesson(), 'candidate-build', true, '先前通过')
    const failed = await store.recordOperation(workspace(), lesson(), 'candidate-build', false, '语法错误')
    expect(failed.state).toBe('needs-attention')
    expect(failed.operations['candidate-build']).toMatchObject({ state: 'failed', detail: '语法错误' })
    expect(failed.steps.find((step) => step.stepId === 'candidate-build')?.completed).toBe(false)
  })

  it('invalidates source-dependent results after apply and undo without discarding manual learning notes', async () => {
    const { store } = await fixture()
    const currentLesson = lesson()
    currentLesson.steps.splice(2, 0, { stepId: 'review-change', type: 'review-apply', title: '保存', instruction: '检查并保存' })
    currentLesson.completionChecks.splice(1, 0, { type: 'student-change-applied', target: 'App/Src/experiment.c' })
    const files = ['App/Src/experiment.c']
    await store.update(workspace(), currentLesson, { kind: 'step', stepId: 'read-entry', completed: true }, files)
    await store.update(workspace(), currentLesson, { kind: 'answer', questionId: 'build-versus-flash', answer: '编译和烧录不是同一步。' }, files)
    await store.recordOperation(workspace(), currentLesson, 'candidate-build', true, '预检通过', files)
    await store.recordSourceChange(workspace(), currentLesson, 'candidate-applied', ['App/Src/experiment.c'], files)
    expect((await store.get(workspace(), currentLesson, files)).steps.find((step) => step.stepId === 'review-change')?.completed).toBe(true)
    const completed = await store.recordOperation(workspace(), currentLesson, 'firmware-build', true, '固件生成成功', files)
    expect(completed.state).toBe('completed')

    const changed = await store.recordSourceChange(workspace(), currentLesson, 'candidate-applied', ['App/Src/experiment.c'], files)
    expect(changed.state).toBe('needs-attention')
    expect(changed.operations['candidate-build'].state).toBe('passed')
    expect(changed.operations['firmware-build'].state).toBe('stale')
    expect(changed.answers['build-versus-flash']).toBeTruthy()

    const undone = await store.recordSourceChange(workspace(), currentLesson, 'workspace-undone', [], files)
    expect(undone.operations['candidate-build'].state).toBe('stale')
    expect(undone.appliedFiles).toEqual([])
    expect(undone.steps.find((step) => step.stepId === 'review-change')?.completed).toBe(false)
    expect(undone.completedAt).toBeUndefined()
  })

  it('serializes concurrent writes and maps each answer and observation to its own step', async () => {
    const { store } = await fixture()
    const multi = lesson()
    multi.steps = [
      { stepId: 'question-one-step', type: 'question', questionId: 'question-one', title: '问题一', instruction: '回答一' },
      { stepId: 'question-two-step', type: 'question', questionId: 'question-two', title: '问题二', instruction: '回答二' },
      { stepId: 'observe-one', type: 'hardware-observation', title: '观察一', instruction: '记录一' },
      { stepId: 'observe-two', type: 'serial-observation', title: '观察二', instruction: '记录二' }
    ]
    multi.reflectionQuestions = [{ questionId: 'question-one', prompt: '问题一？' }, { questionId: 'question-two', prompt: '问题二？' }]
    multi.completionChecks = [
      { type: 'question-answered', target: 'question-one' }, { type: 'question-answered', target: 'question-two' },
      { type: 'manual-observation-confirmed', target: 'observe-one' }, { type: 'manual-observation-confirmed', target: 'observe-two' }
    ]
    await Promise.all([
      store.update(workspace(), multi, { kind: 'answer', questionId: 'question-one', answer: '答案一' }),
      store.update(workspace(), multi, { kind: 'answer', questionId: 'question-two', answer: '答案二' }),
      store.update(workspace(), multi, { kind: 'observation', stepId: 'observe-one', observation: '现象一' }),
      store.update(workspace(), multi, { kind: 'observation', stepId: 'observe-two', observation: '现象二' })
    ])
    const result = await store.get(workspace(), multi)
    expect(result.answers).toEqual({ 'question-one': '答案一', 'question-two': '答案二' })
    expect(result.observations).toEqual({ 'observe-one': '现象一', 'observe-two': '现象二' })
    expect(result.steps.every((step) => step.completed)).toBe(true)
    expect(result.checks.every((check) => check.passed)).toBe(true)
  })

  it('treats a lecture-bound read step as an ordinary lab observation', async () => {
    const { store } = await fixture()
    const currentLesson = lesson()
    currentLesson.steps[0].lectureSectionId = 'studio-workflow'
    const updated = await store.update(workspace(), currentLesson, { kind: 'step', stepId: 'read-entry', completed: true })
    expect(updated.steps.find((step) => step.stepId === 'read-entry')?.completed).toBe(true)
  })

  it('keeps the original generic read confirmation for a compatible older workspace', async () => {
    const { store } = await fixture()
    const oldWorkspace = workspace()
    oldWorkspace.courseBinding = { ...oldWorkspace.courseBinding!, contentVersion: 2 }
    const latestLesson = lesson()
    latestLesson.contentVersion = 3
    latestLesson.progressCompatibleFrom = [2]
    latestLesson.steps[0].lectureSectionId = 'studio-workflow'
    const updated = await store.update(oldWorkspace, latestLesson, { kind: 'step', stepId: 'read-entry', completed: true })
    expect(updated.contentVersion).toBe(2)
    expect(updated.steps.find((step) => step.stepId === 'read-entry')?.completed).toBe(true)
  })

  it('migrates a compatible schema v1 progress file to the compact contract', async () => {
    const { store, root } = await fixture()
    const oldWorkspace = workspace()
    oldWorkspace.courseBinding = { ...oldWorkspace.courseBinding!, contentVersion: 2 }
    const latestLesson = lesson()
    latestLesson.contentVersion = 3
    latestLesson.progressCompatibleFrom = [2]
    const now = new Date().toISOString()
    const legacy = {
      schemaVersion: 1, workspaceId: oldWorkspace.id, courseId: oldWorkspace.courseBinding.courseId,
      lessonId: oldWorkspace.courseBinding.lessonId, contentVersion: 2,
      steps: latestLesson.steps.map((step) => ({ stepId: step.stepId, completed: step.stepId === 'read-entry' })),
      answers: {}, observations: {}, appliedFiles: [],
      operations: { 'candidate-build': { state: 'not-run' }, 'firmware-build': { state: 'not-run' }, flash: { state: 'not-run' } },
      createdAt: now, updatedAt: now
    }
    const progressPath = join(root, 'course-progress', `${oldWorkspace.id}.json`)
    await writeFile(progressPath, JSON.stringify(legacy), 'utf8')
    const migrated = await store.get(oldWorkspace, latestLesson)
    const stored = JSON.parse(await readFile(progressPath, 'utf8')) as { schemaVersion: number; contract: { contentVersion: number; steps: unknown[] } }
    expect(migrated.contentVersion).toBe(2)
    expect(migrated.steps.find((step) => step.stepId === 'read-entry')?.completed).toBe(true)
    expect(stored).toMatchObject({ schemaVersion: 2, contract: { contentVersion: 2 } })
    expect(stored.contract.steps).toHaveLength(latestLesson.steps.length)
  })
})
