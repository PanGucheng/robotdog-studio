import { AlertTriangle, ArrowRight, BookOpenCheck, Check, ChevronDown, Circle, ListChecks, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CourseLesson, CourseProgressSnapshot, CourseProgressUpdate, WorkspaceSummary } from '../../../shared/types'

interface McuCourseToolProps {
  workspace: WorkspaceSummary
  lesson?: CourseLesson
  progress?: CourseProgressSnapshot
  busy: boolean
  onUpdate(update: CourseProgressUpdate): Promise<void>
  onBrowseCourses(): void
  onOpenStep(step: CourseLesson['steps'][number]): void
}

const automaticTypes = new Set(['candidate-build', 'firmware-build', 'flash'])

export function McuCourseTool({ workspace, lesson, progress, busy, onUpdate, onBrowseCourses, onOpenStep }: McuCourseToolProps): React.JSX.Element {
  const [answer, setAnswer] = useState('')
  const [observation, setObservation] = useState('')
  const nextStep = useMemo(() => lesson?.steps.find((step) => !progress?.steps.find((item) => item.stepId === step.stepId)?.completed), [lesson, progress])
  const question = nextStep?.questionId ? lesson?.reflectionQuestions.find((item) => item.questionId === nextStep.questionId) : undefined
  useEffect(() => {
    setAnswer(question ? progress?.answers[question.questionId] ?? '' : '')
    setObservation(nextStep ? progress?.observations[nextStep.stepId] ?? '' : '')
  }, [progress?.updatedAt, nextStep?.stepId, question?.questionId])

  if (!lesson || !progress || workspace.workspacePurpose !== 'mcu-lesson-attempt') return <div className="mcu-tool-empty"><BookOpenCheck size={24} /><strong>自由练习项目</strong><p>这个项目不绑定课程。你仍然可以阅读工程、编写代码、生成程序或询问 AI。</p><button type="button" onClick={onBrowseCourses}>浏览课程</button></div>

  const complete = progress.state === 'completed'
  return <div className="mcu-course-tool">
    <header className="mcu-tool-heading">
      <div><span className="eyebrow">第 {workspace.courseBinding?.attemptNumber} 次练习</span><h2>{lesson.title}</h2></div>
      <button type="button" className="mcu-text-button" onClick={onBrowseCourses}>全部课程</button>
    </header>

    <div className={`mcu-progress-line ${complete ? 'is-complete' : progress.state === 'needs-attention' ? 'needs-attention' : ''}`}>
      <span><i style={{ width: `${progress.completionPercent}%` }} /></span><strong>{progress.completedSteps}/{progress.totalSteps}</strong><small>{complete ? '本课已完成' : progress.state === 'needs-attention' ? '需要重新检查' : '学习进度'}</small>
    </div>

    {progress.recoveredFromCorruption && <div className="mcu-compact-warning"><RotateCcw size={14} /> 进度记录已重建，代码没有变化。</div>}
    {lesson.verification === 'pending-hardware-check' && <div className="mcu-compact-warning"><AlertTriangle size={14} /> 本课尚未通过真机检查。</div>}

    <section className="mcu-current-step">
      <span className="eyebrow">{complete ? '完成' : '当前一步'}</span>
      <h3>{nextStep?.title ?? '检查本课完成情况'}</h3>
      <p>{nextStep?.instruction ?? '所有步骤已经记录，可以继续复习或返回课程目录。'}</p>
      {nextStep && <button type="button" className="button-primary" onClick={() => onOpenStep(nextStep)} disabled={busy}>{stepActionLabel(nextStep.type)} <ArrowRight size={14} /></button>}
    </section>

    {question && nextStep && <section className="mcu-inline-response"><label>{question.prompt}</label><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="用自己的话写下理解。" /><button type="button" onClick={() => void onUpdate({ kind: 'answer', questionId: question.questionId, answer })} disabled={busy || !answer.trim()}>保存回答</button></section>}
    {nextStep && ['serial-observation', 'hardware-observation'].includes(nextStep.type) && <section className="mcu-inline-response"><label>记录实际观察</label><textarea value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="没有观察到时不要猜测。" /><button type="button" onClick={() => void onUpdate({ kind: 'observation', stepId: nextStep.stepId, observation })} disabled={busy || !observation.trim()}>保存观察</button></section>}

    <details className="mcu-step-list">
      <summary><ListChecks size={15} /> 全部步骤 <ChevronDown size={14} /></summary>
      <div>{lesson.steps.map((step, index) => {
        const item = progress.steps.find((entry) => entry.stepId === step.stepId)
        const automatic = automaticTypes.has(step.type)
        return <article key={step.stepId} className={item?.completed ? 'is-complete' : ''}>
          <button type="button" aria-label={`${item?.completed ? '取消完成' : '标记完成'}：${step.title}`} disabled={busy || automatic} onClick={() => void onUpdate({ kind: 'step', stepId: step.stepId, completed: !item?.completed })}>{item?.completed ? <Check size={13} /> : <Circle size={13} />}</button>
          <span><small>{String(index + 1).padStart(2, '0')}</small><strong>{step.title}</strong></span>
          <button type="button" className="mcu-step-open" onClick={() => onOpenStep(step)}><ArrowRight size={13} /></button>
        </article>
      })}</div>
    </details>

    <details className="mcu-completion-details"><summary>完成条件 · {progress.checks.filter((check) => check.passed).length}/{progress.checks.length}</summary>{progress.checks.map((check, index) => <p key={`${check.type}-${check.target ?? index}`} className={check.passed ? 'is-passed' : ''}>{check.passed ? <Check size={12} /> : <Circle size={12} />}{check.label}</p>)}</details>
  </div>
}

function stepActionLabel(type: string): string {
  if (type === 'read' || type === 'edit') return '定位代码'
  if (type === 'candidate-build') return '检查修改'
  if (type === 'review-apply') return '确认差异'
  if (type === 'firmware-build') return '生成程序'
  if (type === 'flash') return '写入开发板'
  if (type === 'question') return '填写回答'
  return '记录完成'
}
