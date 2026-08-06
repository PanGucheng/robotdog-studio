import { AlertTriangle, ArrowRight, BookOpen, Cable, Check, CheckCircle2, Circle, Code2, Cpu, FileQuestion, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { CourseLesson, CourseOperationKind, CourseProgressSnapshot, CourseProgressUpdate, WorkspaceSummary } from '../../../shared/types'
import type { WorkbenchRoute } from './workbench-routes'

interface CourseTaskPageProps {
  workspace?: WorkspaceSummary
  lesson?: CourseLesson
  progress?: CourseProgressSnapshot
  busy: boolean
  onUpdate(update: CourseProgressUpdate): Promise<void>
  onNavigate(route: WorkbenchRoute): void
}

const automaticTypes = new Set(['candidate-build', 'firmware-build', 'flash'])

export function CourseTaskPage({ workspace, lesson, progress, busy, onUpdate, onNavigate }: CourseTaskPageProps): React.JSX.Element {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [observations, setObservations] = useState<Record<string, string>>({})
  useEffect(() => { setAnswers(progress?.answers ?? {}); setObservations(progress?.observations ?? {}) }, [progress?.updatedAt, progress?.workspaceId])

  const nextStep = useMemo(() => lesson?.steps.find((step) => !progress?.steps.find((item) => item.stepId === step.stepId)?.completed), [lesson, progress])
  if (!workspace || !lesson || !progress) return (
    <div className="workbench-content course-task-empty">
      <BookOpen size={28} />
      <h2>实验任务只属于课程练习</h2>
      <p>从课程中心开始一节课，系统会为它建立独立任务记录。普通练习项目继续使用工程代码。</p>
      <button type="button" className="button-primary" onClick={() => onNavigate('course-center')}>返回课程中心</button>
    </div>
  )

  const stateLabel = progress.state === 'completed' ? '本课已完成' : progress.state === 'needs-attention' ? '有步骤需要处理' : progress.state === 'in-progress' ? '正在学习' : '尚未开始'
  const stateTone = progress.state === 'completed' ? 'is-complete' : progress.state === 'needs-attention' ? 'needs-attention' : ''
  return (
    <div className="workbench-content course-task-page">
      <header className="course-task-hero">
        <div>
          <span className="eyebrow">LAB NOTE · 第 {workspace.courseBinding?.attemptNumber} 次练习</span>
          <h2>{lesson.title}</h2>
          <p>{lesson.summary}</p>
          <div className="course-task-meta"><span>{lesson.estimatedMinutes} 分钟</span><span>{lesson.hardware === 'none' ? '无需硬件' : '需要开发板'}</span><span>内容版本 {workspace.courseBinding?.contentVersion}</span></div>
        </div>
        <div className={`course-progress-dial ${stateTone}`} style={{ '--course-progress': `${progress.completionPercent * 3.6}deg` } as CSSProperties}>
          <strong>{progress.completionPercent}%</strong>
          <span>{stateLabel}</span>
        </div>
      </header>

      {progress.recoveredFromCorruption && <div className="course-progress-warning"><RotateCcw size={16} /><span><strong>进度记录已重建</strong>损坏文件已保留为备份，学生代码和 Git 存档未受影响。</span></div>}
      {lesson.verification === 'pending-hardware-check' && <div className="course-progress-warning"><AlertTriangle size={16} /><span><strong>本课尚未通过真机检查</strong>只能阅读结构，不能据此接线、烧录或确认硬件现象。</span></div>}

      <section className="course-next-step">
        <span>下一步</span>
        <strong>{nextStep?.title ?? '检查完成条件'}</strong>
        <p>{nextStep?.instruction ?? '所有任务步骤均已记录，请确认下方完成条件。'}</p>
        {nextStep && <button type="button" onClick={() => handleStepAction(nextStep.type, nextStep.stepId, progress, onUpdate, onNavigate)} disabled={busy}>
          {stepActionLabel(nextStep.type)} <ArrowRight size={15} />
        </button>}
      </section>

      <div className="course-task-layout">
        <section className="course-step-track" aria-label="实验步骤">
          <div className="course-section-heading"><div><span className="eyebrow">Task trace</span><h3>实验路径</h3></div><span>{progress.completedSteps}/{progress.totalSteps}</span></div>
          {lesson.steps.map((step, index) => {
            const stepProgress = progress.steps.find((item) => item.stepId === step.stepId)
            const automatic = automaticTypes.has(step.type)
            const route = routeForStep(step.type)
            return <article key={step.stepId} className={`course-task-step ${stepProgress?.completed ? 'is-complete' : ''}`}>
              <button type="button" className="course-step-check" aria-label={`${stepProgress?.completed ? '取消完成' : '标记完成'}：${step.title}`} disabled={busy || automatic} onClick={() => void onUpdate({ kind: 'step', stepId: step.stepId, completed: !stepProgress?.completed })}>
                {stepProgress?.completed ? <Check size={15} /> : <Circle size={15} />}
              </button>
              <div className="course-step-number">{String(index + 1).padStart(2, '0')}</div>
              <div><strong>{step.title}</strong><p>{step.instruction}</p>{automatic && <small>{operationHint(step.type, progress)}</small>}</div>
              {route && <button type="button" className="course-step-route" onClick={() => onNavigate(route)}>{stepActionLabel(step.type)} <ArrowRight size={14} /></button>}
              {['serial-observation', 'hardware-observation'].includes(step.type) && <div className="course-step-input">
                <textarea value={observations[step.stepId] ?? ''} onChange={(event) => setObservations((current) => ({ ...current, [step.stepId]: event.target.value }))} placeholder="记录你实际看到的现象；没有观察到时不要猜测。" />
                <button type="button" onClick={() => void onUpdate({ kind: 'observation', stepId: step.stepId, observation: observations[step.stepId] ?? '' })} disabled={busy}>保存观察</button>
              </div>}
            </article>
          })}
        </section>

        <aside className="course-task-sidebar">
          <section className="course-operation-board">
            <div className="course-section-heading"><div><span className="eyebrow">Latest checks</span><h3>最近操作</h3></div></div>
            <OperationRow icon={<Code2 size={15} />} label="候选预检" operation={progress.operations['candidate-build']} />
            <OperationRow icon={<Cpu size={15} />} label="完整程序" operation={progress.operations['firmware-build']} />
            <OperationRow icon={<Cable size={15} />} label="烧录" operation={progress.operations.flash} />
            <p className="course-reference-note">这些记录只用于继续学习，不是考试或审计证据。代码变化后请按需重新编译。</p>
          </section>

          {lesson.reflectionQuestions.length > 0 && <section className="course-question-board">
            <div className="course-section-heading"><div><span className="eyebrow">Reflection</span><h3>思考与总结</h3></div><FileQuestion size={17} /></div>
            {lesson.reflectionQuestions.map((question) => <label key={question.questionId}>{question.prompt}
              <textarea value={answers[question.questionId] ?? ''} onChange={(event) => setAnswers((current) => ({ ...current, [question.questionId]: event.target.value }))} placeholder="用自己的话写下理解，不需要标准答案。" />
              <button type="button" onClick={() => void onUpdate({ kind: 'answer', questionId: question.questionId, answer: answers[question.questionId] ?? '' })} disabled={busy}>保存回答</button>
            </label>)}
          </section>}

          <section className="course-check-board">
            <div className="course-section-heading"><div><span className="eyebrow">Completion</span><h3>完成条件</h3></div></div>
            {progress.checks.map((check, index) => <div key={`${check.type}-${check.target ?? index}`} className={check.passed ? 'is-passed' : ''}>{check.passed ? <CheckCircle2 size={15} /> : <Circle size={15} />}<span>{check.label}</span></div>)}
          </section>
        </aside>
      </div>
    </div>
  )
}

function routeForStep(type: CourseLesson['steps'][number]['type']): WorkbenchRoute | undefined {
  if (type === 'edit' || type === 'candidate-build') return 'code'
  if (type === 'review-apply') return 'review'
  if (type === 'firmware-build') return 'build'
  if (type === 'flash') return 'flash'
  return undefined
}

function stepActionLabel(type: CourseLesson['steps'][number]['type']): string {
  if (type === 'edit') return '打开代码'
  if (type === 'candidate-build') return '检查代码'
  if (type === 'review-apply') return '查看修改'
  if (type === 'firmware-build') return '生成程序'
  if (type === 'flash') return '前往烧录'
  return '标记完成'
}

function handleStepAction(type: CourseLesson['steps'][number]['type'], stepId: string, progress: CourseProgressSnapshot, onUpdate: CourseTaskPageProps['onUpdate'], onNavigate: CourseTaskPageProps['onNavigate']): void {
  const route = routeForStep(type)
  if (route) onNavigate(route)
  else void onUpdate({ kind: 'step', stepId, completed: !progress.steps.find((step) => step.stepId === stepId)?.completed })
}

function operationHint(type: CourseLesson['steps'][number]['type'], progress: CourseProgressSnapshot): string {
  const kind = type === 'candidate-build' ? 'candidate-build' : type === 'firmware-build' ? 'firmware-build' : 'flash'
  const operation = progress.operations[kind]
  return operation.state === 'not-run' ? '尚未执行' : `${operation.state === 'passed' ? '已通过' : '未通过'}${operation.checkedAt ? ` · ${new Date(operation.checkedAt).toLocaleString('zh-CN')}` : ''}`
}

function OperationRow({ icon, label, operation }: { icon: ReactNode; label: string; operation: CourseProgressSnapshot['operations'][CourseOperationKind] }): React.JSX.Element {
  return <div className={`course-operation-row is-${operation.state}`}>{icon}<span><strong>{label}</strong><small>{operation.state === 'not-run' ? '尚未执行' : operation.state === 'passed' ? '最近一次通过' : '最近一次未通过'}{operation.checkedAt ? ` · ${new Date(operation.checkedAt).toLocaleString('zh-CN')}` : ''}</small></span></div>
}
