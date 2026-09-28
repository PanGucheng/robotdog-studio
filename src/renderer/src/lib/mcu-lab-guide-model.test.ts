import { describe, expect, it } from 'vitest'
import type { CourseLesson, CourseProgressSnapshot } from '../../../shared/types'
import { deriveLabGuideModel } from './mcu-lab-guide-model'

const lesson = {
  steps: [
    { stepId: 'read', type: 'read', title: '阅读', instruction: '阅读' },
    { stepId: 'check', type: 'candidate-build', title: '检查', instruction: '检查' },
    { stepId: 'apply', type: 'review-apply', title: '保存', instruction: '保存', fileTarget: { path: 'App/test.c' } },
    { stepId: 'build', type: 'firmware-build', title: '生成', instruction: '生成' },
    { stepId: 'answer', type: 'question', questionId: 'q1', title: '回答', instruction: '回答' }
  ],
  reflectionQuestions: [{ questionId: 'q1', prompt: '为什么？' }]
} as CourseLesson

function progress(overrides: Partial<CourseProgressSnapshot> = {}): CourseProgressSnapshot {
  return {
    schemaVersion: 1, workspaceId: 'ws', courseId: 'course', lessonId: 'lesson', contentVersion: 1,
    steps: lesson.steps.map((step) => ({ stepId: step.stepId, completed: step.stepId === 'read' })),
    answers: {}, observations: {}, appliedFiles: [],
    operations: { 'candidate-build': { state: 'not-run' }, 'firmware-build': { state: 'not-run' }, flash: { state: 'not-run' } },
    checks: [
      { type: 'candidate-build-passed', passed: false, label: '候选代码编译通过' },
      { type: 'student-change-applied', target: 'App/test.c', passed: false, label: '修改已保存' },
      { type: 'firmware-build-passed', passed: false, label: '完整程序生成成功' },
      { type: 'question-answered', target: 'q1', passed: false, label: '回答已保存' }
    ], completedSteps: 1, totalSteps: 5, completionPercent: 20, state: 'in-progress', createdAt: '', updatedAt: '', ...overrides
  }
}

describe('deriveLabGuideModel', () => {
  it('uses stepId alignment and maps acceptance evidence to steps', () => {
    const model = deriveLabGuideModel(lesson, progress({ steps: [
      { stepId: 'build', completed: false }, { stepId: 'read', completed: true }, { stepId: 'answer', completed: false },
      { stepId: 'apply', completed: false }, { stepId: 'check', completed: false }
    ] }))
    expect(model.compatible).toBe(true)
    expect(model.currentStep?.step.stepId).toBe('check')
    expect(model.steps.find((step) => step.step.stepId === 'apply')?.evidence[0].type).toBe('student-change-applied')
  })

  it('locates the first failed or stale operation without marking dependants as errors', () => {
    const model = deriveLabGuideModel(lesson, progress({
      operations: { 'candidate-build': { state: 'failed', detail: '发现 2 个问题' }, 'firmware-build': { state: 'stale' }, flash: { state: 'not-run' } },
      state: 'needs-attention'
    }))
    expect(model.steps.find((step) => step.step.stepId === 'check')).toMatchObject({ status: 'needs-attention', detail: '发现 2 个问题' })
    expect(model.steps.find((step) => step.step.stepId === 'build')).toMatchObject({ status: 'upcoming', statusLabel: '等待重新验证' })
  })

  it('fails safely when the course and progress step identities differ', () => {
    const model = deriveLabGuideModel(lesson, progress({ steps: [{ stepId: 'unknown', completed: true }], totalSteps: 1, completedSteps: 1 }))
    expect(model.compatible).toBe(false)
    expect(model.steps).toEqual([])
  })

  it('distinguishes all steps complete from experiment accepted', () => {
    const steps = lesson.steps.map((step) => ({ stepId: step.stepId, completed: true }))
    const model = deriveLabGuideModel(lesson, progress({ steps, completedSteps: 5, totalSteps: 5, completionPercent: 100, state: 'in-progress' }))
    expect(model.awaitingAcceptance).toBe(true)
    expect(model.experimentCompleted).toBe(false)
  })

  it('correctly maps target step completion checks in multi-checkpoint lessons', () => {
    const multiLesson = {
      steps: [
        { stepId: 'edit-1', type: 'edit', title: '编写点亮', instruction: '点亮' },
        { stepId: 'build-1', type: 'firmware-build', title: '编译点亮', instruction: '编译点亮' },
        { stepId: 'flash-1', type: 'flash', title: '烧录点亮', instruction: '烧录点亮' },
        { stepId: 'obs-1', type: 'hardware-observation', title: '观察点亮', instruction: '观察点亮' },
        { stepId: 'edit-2', type: 'edit', title: '改写闪烁', instruction: '闪烁' },
        { stepId: 'build-2', type: 'firmware-build', title: '编译闪烁', instruction: '编译闪烁' },
        { stepId: 'flash-2', type: 'flash', title: '烧录闪烁', instruction: '烧录闪烁' }
      ],
      reflectionQuestions: []
    } as unknown as CourseLesson

    const multiProgress: CourseProgressSnapshot = {
      schemaVersion: 1, workspaceId: 'ws', courseId: 'course', lessonId: 'lesson', contentVersion: 1,
      steps: multiLesson.steps.map((step) => ({ stepId: step.stepId, completed: ['edit-1', 'build-1', 'flash-1', 'obs-1'].includes(step.stepId) })),
      answers: {}, observations: { 'obs-1': 'LED已亮' }, appliedFiles: ['App/Src/experiment.c'],
      operations: { 'candidate-build': { state: 'passed' }, 'firmware-build': { state: 'passed' }, flash: { state: 'passed' } },
      checks: [
        { type: 'firmware-build-passed', target: 'build-1', passed: true, label: '编译1' },
        { type: 'flash-succeeded', target: 'flash-1', passed: true, label: '烧录1' },
        { type: 'manual-observation-confirmed', target: 'obs-1', passed: true, label: '观察1' },
        { type: 'firmware-build-passed', target: 'build-2', passed: false, label: '编译2' },
        { type: 'flash-succeeded', target: 'flash-2', passed: false, label: '烧录2' }
      ],
      completedSteps: 4, totalSteps: 7, completionPercent: 57, state: 'in-progress', createdAt: '', updatedAt: ''
    }

    const model = deriveLabGuideModel(multiLesson, multiProgress)
    expect(model.compatible).toBe(true)
    expect(model.currentStep?.step.stepId).toBe('edit-2')
    expect(model.steps.find((s) => s.step.stepId === 'build-1')?.evidence[0]).toMatchObject({ type: 'firmware-build-passed', target: 'build-1' })
    expect(model.steps.find((s) => s.step.stepId === 'flash-1')?.evidence[0]).toMatchObject({ type: 'flash-succeeded', target: 'flash-1' })
    expect(model.steps.find((s) => s.step.stepId === 'build-2')?.evidence[0]).toMatchObject({ type: 'firmware-build-passed', target: 'build-2' })
    expect(model.steps.find((s) => s.step.stepId === 'flash-2')?.evidence[0]).toMatchObject({ type: 'flash-succeeded', target: 'flash-2' })
  })
})
