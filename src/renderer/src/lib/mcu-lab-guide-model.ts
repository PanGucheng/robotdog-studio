import type { CourseCompletionCheckResult, CourseLesson, CourseOperationKind, CourseProgressSnapshot } from '../../../shared/types'

export type LabStepStatus = 'completed' | 'current' | 'needs-attention' | 'upcoming'

export interface LabGuideStepModel {
  step: CourseLesson['steps'][number]
  index: number
  status: LabStepStatus
  statusLabel: string
  detail?: string
  completionHint: string
  manualCompletion: boolean
  evidence: CourseCompletionCheckResult[]
}

export interface LabGuideModel {
  compatible: boolean
  compatibilityMessage?: string
  steps: LabGuideStepModel[]
  currentStep?: LabGuideStepModel
  completedSteps: number
  totalSteps: number
  experimentCompleted: boolean
  awaitingAcceptance: boolean
  unmappedBlockingChecks: CourseCompletionCheckResult[]
}

const manualTypes = new Set(['read', 'summary'])
const operationTypes: Record<CourseOperationKind, string> = {
  'candidate-build': 'candidate-build',
  'firmware-build': 'firmware-build',
  flash: 'flash'
}

export function deriveLabGuideModel(lesson: CourseLesson, progress: CourseProgressSnapshot): LabGuideModel {
  const lessonIds = lesson.steps.map((step) => step.stepId)
  const progressIds = progress.steps.map((step) => step.stepId)
  const uniqueLessonIds = new Set(lessonIds)
  const uniqueProgressIds = new Set(progressIds)
  const compatible = uniqueLessonIds.size === lessonIds.length
    && uniqueProgressIds.size === progressIds.length
    && lessonIds.length === progressIds.length
    && lessonIds.every((stepId) => uniqueProgressIds.has(stepId))
  if (!compatible) {
    return {
      compatible: false,
      compatibilityMessage: '此练习的任务记录与当前课程版本无法安全对齐。进度没有被改写，请返回本课并新建练习。',
      steps: [], completedSteps: progress.completedSteps, totalSteps: progress.totalSteps,
      experimentCompleted: false, awaitingAcceptance: false, unmappedBlockingChecks: []
    }
  }

  const progressById = new Map(progress.steps.map((step) => [step.stepId, step]))
  const firstIncompleteIndex = lesson.steps.findIndex((step) => !progressById.get(step.stepId)?.completed)
  const evidenceByStep = new Map<string, CourseCompletionCheckResult[]>()
  const unmappedChecks: CourseCompletionCheckResult[] = []
  for (const check of progress.checks) {
    const stepId = mapCheckToStep(check, lesson)
    if (!stepId) { unmappedChecks.push(check); continue }
    evidenceByStep.set(stepId, [...(evidenceByStep.get(stepId) ?? []), check])
  }

  const attentionByStep = new Map<string, string>()
  for (const [kind, operation] of Object.entries(progress.operations) as Array<[CourseOperationKind, CourseProgressSnapshot['operations'][CourseOperationKind]]>) {
    if (operation.state !== 'failed' && operation.state !== 'stale') continue
    const step = lesson.steps.find((item) => item.type === operationTypes[kind])
    if (step) attentionByStep.set(step.stepId, operation.detail ?? (operation.state === 'stale' ? '之前的结果已经过期，请重新验证。' : '最近一次验证未通过。'))
  }
  const firstAttentionIndex = lesson.steps.findIndex((step) => attentionByStep.has(step.stepId) && !progressById.get(step.stepId)?.completed)
  const actionableAttentionIndex = firstAttentionIndex === firstIncompleteIndex ? firstAttentionIndex : -1

  const steps = lesson.steps.map((step, index): LabGuideStepModel => {
    const completed = Boolean(progressById.get(step.stepId)?.completed)
    const isAttention = index === actionableAttentionIndex
    const isCurrent = !completed && index === firstIncompleteIndex
    const status: LabStepStatus = completed ? 'completed' : isAttention ? 'needs-attention' : isCurrent ? 'current' : 'upcoming'
    const waitingOnAttention = actionableAttentionIndex >= 0 && index > actionableAttentionIndex
    return {
      step, index, status,
      statusLabel: status === 'completed' ? '已完成' : status === 'current' ? '当前步骤' : status === 'needs-attention' ? '需要处理' : waitingOnAttention ? '等待重新验证' : '后续步骤',
      detail: status === 'needs-attention' ? attentionByStep.get(step.stepId) : waitingOnAttention ? '等待前面的结果重新通过后继续。' : undefined,
      completionHint: completionHint(step.type),
      manualCompletion: manualTypes.has(step.type),
      evidence: evidenceByStep.get(step.stepId) ?? []
    }
  })
  const currentStep = steps.find((step) => step.status === 'needs-attention') ?? steps.find((step) => step.status === 'current')
  const allStepsComplete = progress.completedSteps === progress.totalSteps && progress.totalSteps === lesson.steps.length
  return {
    compatible: true, steps, currentStep,
    completedSteps: progress.completedSteps, totalSteps: progress.totalSteps,
    experimentCompleted: progress.state === 'completed',
    awaitingAcceptance: allStepsComplete && progress.state !== 'completed',
    unmappedBlockingChecks: allStepsComplete ? unmappedChecks.filter((check) => !check.passed) : []
  }
}

function mapCheckToStep(check: CourseCompletionCheckResult, lesson: CourseLesson): string | undefined {
  if (check.type === 'candidate-build-passed') return uniqueStepOfType(lesson, 'candidate-build')
  if (check.type === 'firmware-build-passed') return uniqueStepOfType(lesson, 'firmware-build')
  if (check.type === 'flash-succeeded') return uniqueStepOfType(lesson, 'flash')
  if (check.type === 'manual-observation-confirmed') return check.target && lesson.steps.some((step) => step.stepId === check.target) ? check.target : undefined
  if (check.type === 'question-answered') return lesson.steps.find((step) => step.type === 'question' && step.questionId === check.target)?.stepId
  if (check.type === 'student-change-applied') {
    const matches = lesson.steps.filter((step) => step.type === 'review-apply' && (!check.target || step.fileTarget?.path === check.target))
    return matches.length === 1 ? matches[0].stepId : uniqueStepOfType(lesson, 'review-apply')
  }
  if (check.type === 'file-exists' && check.target) {
    const matches = lesson.steps.filter((step) => step.fileTarget?.path === check.target)
    return matches.length === 1 ? matches[0].stepId : undefined
  }
  return undefined
}

function uniqueStepOfType(lesson: CourseLesson, type: string): string | undefined {
  const matches = lesson.steps.filter((step) => step.type === type)
  return matches.length === 1 ? matches[0].stepId : undefined
}

export function completionHint(type: string): string {
  if (manualTypes.has(type)) return type === 'read' ? '阅读并确认理解后完成。' : '完成总结并确认后完成。'
  if (type === 'edit') return '实际修改指定文件并成功自动保存后完成。'
  if (type === 'candidate-build') return '当前 Workspace 通过 Compiler / Linker 构建后自动完成。'
  if (type === 'review-apply') return '手工修改自动保存，或 AI 修改确认应用后完成。'
  if (type === 'firmware-build') return '完整程序生成成功后自动完成。'
  if (type === 'flash') return '程序成功写入开发板后自动完成。'
  if (type === 'question') return '保存有效回答后自动完成。'
  if (type === 'serial-observation' || type === 'hardware-observation') return '保存你实际观察到的现象后自动完成。'
  return '完成本步要求后由课程进度确认。'
}
