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
    workspacePurpose: 'mcu-lesson-attempt', templateId: 'lesson-one', templateVersion: 'content-v1',
    courseBinding: { courseId: 'course-one', lessonId: 'lesson-one', contentVersion: 1, attemptNumber: 1 },
    firmwareBaselineId: 'baseline', baselineCommit: 'a'.repeat(40), createdAt: now, headCommit: 'b'.repeat(40), state: 'ready', updatedAt: now
  }
}

function lesson(): CourseLesson {
  return {
    courseId: 'course-one', lessonId: 'lesson-one', title: '第一课', summary: '测试课程进度', estimatedMinutes: 45,
    hardware: 'none', verification: 'not-required', status: 'published', prerequisites: [], order: 0,
    objectives: ['完成一次练习'], expectedObservation: '编译成功', templateId: 'lesson-one', editableGlobs: ['App/**'], readableFiles: [], deniedGlobs: [],
    steps: [
      { stepId: 'read-entry', type: 'read', title: '阅读', instruction: '阅读入口' },
      { stepId: 'candidate-build', type: 'candidate-build', title: '预检', instruction: '运行预检' },
      { stepId: 'firmware-build', type: 'firmware-build', title: '构建', instruction: '生成程序' },
      { stepId: 'reflect', type: 'question', title: '思考', instruction: '回答问题' }
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
    const failed = await store.recordOperation(workspace(), lesson(), 'candidate-build', false, '语法错误')
    expect(failed.state).toBe('needs-attention')
    expect(failed.operations['candidate-build']).toMatchObject({ state: 'failed', detail: '语法错误' })
  })
})
