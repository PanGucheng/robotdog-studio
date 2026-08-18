import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, BookOpenCheck, Check, CheckCircle2, Circle, Expand, FileCode2, Minimize2, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CourseLectureResult, CourseLectureSelectionRange, CourseLesson, CourseProgressSnapshot, CourseProgressUpdate, WorkspaceSummary } from '../../../shared/types'
import { getRobotApi } from '../lib/browser-demo-api'
import { deriveLabGuideModel, type LabGuideStepModel } from '../lib/mcu-lab-guide-model'
import { CourseLectureRenderer } from './CourseLectureRenderer'

interface McuLabGuideProps {
  workspace: WorkspaceSummary
  lesson?: CourseLesson
  progress?: CourseProgressSnapshot
  busy: boolean
  activeFilePath?: string
  lectureFocus: boolean
  onLectureFocusChange(focused: boolean): void
  onUpdate(update: CourseProgressUpdate): Promise<void>
  onBrowseCourses(): void
  onOpenStep(step: CourseLesson['steps'][number]): void
  onFocusFile(path: string, line?: number): void
  onAssistantOpen(intent: 'step' | 'lecture'): void
}

export function McuLabGuide({ workspace, lesson, progress, busy, activeFilePath, lectureFocus, onLectureFocusChange, onUpdate, onBrowseCourses, onOpenStep, onFocusFile, onAssistantOpen }: McuLabGuideProps): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const [mode, setMode] = useState<'tasks' | 'reference'>(() => readCourseMode(workspace.id))
  const [lecture, setLecture] = useState<CourseLectureResult>()
  const [lectureLoading, setLectureLoading] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState<string>()
  const [selectedStepId, setSelectedStepId] = useState<string>()
  const [answer, setAnswer] = useState('')
  const [observation, setObservation] = useState('')
  const [lectureSelection, setLectureSelection] = useState<{ range: CourseLectureSelectionRange; preview: string }>()
  const [lectureQuestion, setLectureQuestion] = useState('')
  const [lectureQuestionError, setLectureQuestionError] = useState<string>()
  const [lectureFontSize, setLectureFontSize] = useState(readLectureFontSize)
  const lectureScrollRef = useRef<HTMLDivElement>(null)
  const taskScrollRef = useRef<HTMLDivElement>(null)
  const stepRefs = useRef(new Map<string, HTMLElement>())
  const pendingAdvanceRef = useRef(false)
  const restoringScrollRef = useRef(false)
  const guide = useMemo(() => lesson && progress ? deriveLabGuideModel(lesson, progress) : undefined, [lesson, progress])
  const displayedStep = guide?.steps.find((item) => item.step.stepId === selectedStepId) ?? guide?.currentStep
  const question = displayedStep?.step.questionId ? lesson?.reflectionQuestions.find((item) => item.questionId === displayedStep.step.questionId) : undefined
  const currentVersion = Boolean(lesson && workspace.courseBinding?.contentVersion === lesson.contentVersion)
  const document = lecture?.status === 'ready' ? lecture.document : undefined
  const activeSection = document?.sections.find((section) => section.sectionId === activeSectionId) ?? document?.sections[0]
  const relatedSectionId = activeFilePath && document?.codeTargetIndex[activeFilePath]?.[0]

  useEffect(() => {
    setAnswer(question ? progress?.answers[question.questionId] ?? '' : '')
    setObservation(displayedStep ? progress?.observations[displayedStep.step.stepId] ?? '' : '')
  }, [progress?.updatedAt, displayedStep?.step.stepId, question?.questionId])

  useEffect(() => {
    localStorage.setItem(`robotdog.mcu.lab-guide.v1.${workspace.id}`, JSON.stringify({ version: 1, kind: mode }))
    if (mode !== 'reference') onLectureFocusChange(false)
  }, [workspace.id, mode, onLectureFocusChange])

  useEffect(() => { localStorage.setItem('robotdog.mcu-lecture-font-size', String(lectureFontSize)) }, [lectureFontSize])

  useEffect(() => {
    if (!lesson || workspace.workspacePurpose !== 'mcu-lesson-attempt') { setLecture(undefined); return }
    let disposed = false
    setLectureLoading(true)
    void api.getCourseLecture(lesson.courseId, lesson.lessonId).then((result) => {
      if (disposed) return
      setLecture(result)
      if (result.status === 'ready') {
        const stored = readLectureState(workspace.id, result.document.contentVersion)
        const nextId = result.document.sections.some((section) => section.sectionId === stored.sectionId) ? stored.sectionId : result.document.sections[0]?.sectionId
        restoringScrollRef.current = true
        setActiveSectionId(nextId)
        requestAnimationFrame(() => {
          if (lectureScrollRef.current) lectureScrollRef.current.scrollTop = stored.scrollTop
          restoringScrollRef.current = false
        })
      }
    }).catch(() => { if (!disposed) setLecture({ status: 'invalid', errorCode: 'LECTURE_LOAD_FAILED' }) })
      .finally(() => { if (!disposed) setLectureLoading(false) })
    return () => { disposed = true }
  }, [api, workspace.id, lesson?.courseId, lesson?.lessonId, lesson?.contentVersion])

  useEffect(() => {
    if (!document || !activeSectionId) return
    const state = readLectureState(workspace.id, document.contentVersion)
    writeLectureState(workspace.id, document.contentVersion, { ...state, sectionId: activeSectionId })
    if (!restoringScrollRef.current && lectureScrollRef.current) lectureScrollRef.current.scrollTop = 0
  }, [workspace.id, document?.documentDigest, activeSectionId])

  useEffect(() => {
    if (mode !== 'tasks' || selectedStepId || !guide?.currentStep) return
    const target = stepRefs.current.get(guide.currentStep.step.stepId)
    if (!target || !taskScrollRef.current) return
    const frame = requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      if (pendingAdvanceRef.current) { target.focus({ preventScroll: true }); pendingAdvanceRef.current = false }
    })
    return () => cancelAnimationFrame(frame)
  }, [mode, selectedStepId, guide?.currentStep?.step.stepId])

  if (!lesson || !progress || workspace.workspacePurpose !== 'mcu-lesson-attempt') return <div className="mcu-tool-empty"><BookOpenCheck size={24} /><strong>自由练习项目</strong><p>这个项目不绑定课程。你仍然可以阅读工程、编写代码、生成程序或询问 AI。</p><button type="button" onClick={onBrowseCourses}>浏览课程</button></div>

  const complete = progress.state === 'completed'
  const openLecture = (sectionId?: string): void => {
    if (sectionId && document?.sections.some((section) => section.sectionId === sectionId)) setActiveSectionId(sectionId)
    setMode('reference')
  }
  const openTask = (stepId: string): void => {
    setSelectedStepId(stepId)
    setMode('tasks')
  }
  return <div className={`mcu-course-tool mcu-lab-guide ${mode === 'reference' ? 'is-lecture-mode' : ''}`} style={{ '--lecture-font-size': `${lectureFontSize}px` } as CSSProperties}>
    {mode === 'reference' ? <>
      <header className="mcu-tool-heading"><div><span className="eyebrow">知识参考</span><h2>{lesson.title}</h2></div><button type="button" className="mcu-text-button" onClick={onBrowseCourses}>返回本课</button></header>
      <button type="button" className="mcu-reference-back" onClick={() => setMode('tasks')}><ArrowLeft size={14} /> 返回实验任务</button>
    </> : <div className="mcu-lab-sticky">
      <header className="mcu-tool-heading"><div><span className="eyebrow">实验任务</span><h2>{lesson.title}</h2></div><button type="button" className="mcu-text-button" onClick={onBrowseCourses}>返回本课</button></header>
      <div className="mcu-lab-meta"><span>第 {workspace.courseBinding?.attemptNumber} 次实验</span><strong>{guide?.experimentCompleted ? <><Check size={13} /> 实验完成</> : guide?.awaitingAcceptance ? `${guide.completedSteps} / ${guide.totalSteps} 步 · 等待验收` : `已完成 ${guide?.completedSteps ?? 0} / ${guide?.totalSteps ?? 0} 步`}</strong></div>
      {guide?.compatible && <nav className="mcu-step-indicator" aria-label="实验步骤进度">{guide.steps.map((item) => <button key={item.step.stepId} type="button" className={`is-${item.status}`} aria-label={`第 ${item.index + 1} 步，${item.step.title}，${item.statusLabel}`} aria-current={item.status === 'current' || item.status === 'needs-attention' ? 'step' : undefined} onClick={() => { setSelectedStepId(item.step.stepId); stepRefs.current.get(item.step.stepId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }}><i>{item.status === 'completed' ? <Check size={11} /> : item.status === 'needs-attention' ? '!' : String(item.index + 1).padStart(2, '0')}</i></button>)}</nav>}
      <div className="mcu-lab-announcer" aria-live="polite">{guide?.currentStep ? `${guide.currentStep.statusLabel}：第 ${guide.currentStep.index + 1} 步 ${guide.currentStep.step.title}` : guide?.experimentCompleted ? '实验已完成并通过验收' : ''}</div>
    </div>}

    {!currentVersion && <div className="mcu-version-warning"><AlertTriangle size={15} /><span><strong>兼容的历史练习</strong>此练习使用课程 v{workspace.courseBinding?.contentVersion} 的稳定任务身份；当前讲义为 v{lesson.contentVersion}，进度仍按 stepId 对齐。</span></div>}

    {mode !== 'reference' ? <div className="mcu-lab-task-scroll" ref={taskScrollRef}>
      {!guide?.compatible ? <div className="mcu-lab-compatibility"><AlertTriangle size={19} /><strong>无法安全读取实验步骤</strong><p>{guide?.compatibilityMessage}</p><button type="button" onClick={onBrowseCourses}>返回本课</button></div> : <>
        {progress.recoveredFromCorruption && <div className="mcu-compact-warning"><RotateCcw size={14} /> 进度记录已重建，代码没有变化。</div>}
        {lesson.verification === 'pending-hardware-check' && <div className="mcu-compact-warning"><AlertTriangle size={14} /><span><strong>课程待硬件验证</strong>硬件观察、烧录等操作暂不可执行，请等待课程完成真机验证。</span></div>}
        {guide.experimentCompleted && <section className="mcu-completion-closure"><CheckCircle2 size={22} /><div><span>实验完成</span><h3>{lesson.title}</h3><p>{guide.totalSteps} 个实验步骤已经完成，本次实验已经通过验收。</p></div><footer><button type="button" onClick={() => { setSelectedStepId(guide.steps[0]?.step.stepId); stepRefs.current.get(guide.steps[0]?.step.stepId ?? '')?.scrollIntoView({ block: 'start' }) }}>回顾实验</button><button type="button" className="button-primary" onClick={onBrowseCourses}>返回本课</button></footer></section>}
        {guide.awaitingAcceptance && <section className="mcu-acceptance-wait"><AlertTriangle size={16} /><span><strong>任务步骤已经完成</strong>还有实验验收需要处理，暂不标记为“实验完成”。</span></section>}
        {guide.unmappedBlockingChecks.length > 0 && <section className="mcu-unmapped-checks"><strong>待处理的实验验收</strong>{guide.unmappedBlockingChecks.map((check, index) => <p key={`${check.type}-${check.target ?? index}`}><AlertTriangle size={13} />{check.label}</p>)}</section>}

        {lecture?.status === 'ready' && <button type="button" className="mcu-reference-open" onClick={() => openLecture()}><BookOpen size={14} /> 打开知识参考</button>}
        <div className="mcu-vertical-stepper">{guide.steps.map((item) => {
          const expanded = displayedStep?.step.stepId === item.step.stepId
          const actionable = (item.status === 'current' || item.status === 'needs-attention') && !complete
          const hardwareBlocked = lesson.verification === 'pending-hardware-check' && ['flash', 'serial-observation', 'hardware-observation'].includes(item.step.type)
          return <article key={item.step.stepId} ref={(node) => { if (node) stepRefs.current.set(item.step.stepId, node); else stepRefs.current.delete(item.step.stepId) }} tabIndex={-1} className={`mcu-lab-step is-${item.status} ${expanded ? 'is-expanded' : ''}`}>
            <span className="mcu-lab-step-rail" aria-hidden="true">{stepStatusIcon(item)}</span>
            <button type="button" className="mcu-lab-step-summary" aria-expanded={expanded} onClick={() => setSelectedStepId(expanded && item === guide.currentStep ? undefined : item.step.stepId)}><span><small>{String(item.index + 1).padStart(2, '0')} · {item.statusLabel}</small><strong>{item.step.title}</strong></span><ArrowRight size={13} /></button>
            {expanded && <div className="mcu-lab-step-body">
              <p>{item.step.instruction}</p>
              {item.detail && <div className="mcu-step-attention"><AlertTriangle size={14} />{item.detail}</div>}
              {item.step.fileTarget && <div className="mcu-step-file"><FileCode2 size={13} /><span>涉及文件</span><code>{item.step.fileTarget.path}{item.step.fileTarget.line ? `:${item.step.fileTarget.line}` : ''}</code></div>}
              <div className="mcu-step-actions">
                {item.step.lectureSectionId && <button type="button" onClick={() => openLecture(item.step.lectureSectionId)} disabled={busy || lecture?.status !== 'ready'}><BookOpen size={14} /> 相关知识</button>}
                {item.step.fileTarget && <button type="button" onClick={() => onOpenStep(item.step)} disabled={busy}><FileCode2 size={14} /> 定位对象</button>}
                {actionable && isSystemAction(item.step.type) && <button type="button" className="button-primary" onClick={() => onOpenStep(item.step)} disabled={busy || hardwareBlocked}>{stepActionLabel(item.step.type)} <ArrowRight size={14} /></button>}
                {actionable && <button type="button" onClick={() => onAssistantOpen('step')}><BookOpenCheck size={14} /> 问 AI</button>}
              </div>
              {actionable && question && item.step.questionId === question.questionId && <section className="mcu-inline-response"><label>{question.prompt}</label><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="用自己的话写下理解。" /><button type="button" onClick={() => { pendingAdvanceRef.current = true; setSelectedStepId(undefined); void onUpdate({ kind: 'answer', questionId: question.questionId, answer }) }} disabled={busy || !answer.trim()}>保存回答</button></section>}
              {actionable && ['serial-observation', 'hardware-observation'].includes(item.step.type) && <section className="mcu-inline-response"><label>记录实际观察</label><textarea value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="只记录亲眼观察到的现象；没有观察到时不要猜测。" /><button type="button" onClick={() => { pendingAdvanceRef.current = true; setSelectedStepId(undefined); void onUpdate({ kind: 'observation', stepId: item.step.stepId, observation }) }} disabled={busy || hardwareBlocked || !observation.trim()}>保存观察</button></section>}
              <div className="mcu-completion-method"><span>完成方式</span><p>{hardwareBlocked ? '课程待硬件验证，当前不能执行这项硬件任务。' : item.completionHint}</p>{actionable && item.manualCompletion && <button type="button" className="button-primary" disabled={busy} onClick={() => { pendingAdvanceRef.current = true; setSelectedStepId(undefined); void onUpdate({ kind: 'step', stepId: item.step.stepId, completed: true }) }}><Check size={14} /> 完成本步</button>}</div>
              {item.evidence.length > 0 && <div className="mcu-step-evidence"><span>验收证据</span>{item.evidence.map((check, index) => <p key={`${check.type}-${check.target ?? index}`} className={check.passed ? 'is-passed' : ''}>{check.passed ? <Check size={12} /> : <Circle size={12} />}{check.label}</p>)}</div>}
            </div>}
          </article>
        })}</div>
      </>}
    </div> : <section className="mcu-lecture-view">
      <div className="lecture-toolbar">
        <label><span>章节</span><select value={activeSection?.sectionId ?? ''} onChange={(event) => setActiveSectionId(event.target.value)} disabled={!document}>{document?.sections.map((section) => <option value={section.sectionId} key={section.sectionId}>{String(section.order + 1).padStart(2, '0')} · {section.title}</option>)}</select></label>
        <div className="lecture-font-controls" aria-label="讲义字号">
          <button type="button" onClick={() => setLectureFontSize((value) => Math.max(13, value - 2))} disabled={lectureFontSize <= 13} aria-label="缩小讲义字号">A−</button>
          <output aria-live="polite">{lectureFontSize}px</output>
          <button type="button" onClick={() => setLectureFontSize((value) => value + 2)} aria-label="放大讲义字号">A+</button>
        </div>
        <button type="button" onClick={() => onLectureFocusChange(!lectureFocus)} aria-label={lectureFocus ? '退出专注阅读' : '进入专注阅读'}>{lectureFocus ? <Minimize2 size={14} /> : <Expand size={14} />}{lectureFocus ? '退出专注' : '专注阅读'}</button>
      </div>

      {relatedSectionId && relatedSectionId !== activeSection?.sectionId && <button type="button" className="lecture-related-file" onClick={() => setActiveSectionId(relatedSectionId)}><FileCode2 size={14} /><span>当前文件相关讲义<strong>{activeFilePath}</strong></span><ArrowRight size={13} /></button>}

      <div className="mcu-lecture-scroll" ref={lectureScrollRef} onScroll={(event) => {
        if (!document) return
        const stored = readLectureState(workspace.id, document.contentVersion)
        writeLectureState(workspace.id, document.contentVersion, { ...stored, sectionId: activeSection?.sectionId, scrollTop: event.currentTarget.scrollTop })
      }}>
        {lectureLoading ? <div className="lecture-loading"><BookOpen size={20} /><p>正在打开讲义…</p></div>
          : lecture?.status === 'ready' && activeSection ? <CourseLectureRenderer document={lecture.document} sectionId={activeSection.sectionId} onOpenSection={setActiveSectionId} onOpenCode={onFocusFile} onOpenTask={openTask} onSelection={(range, preview) => { setLectureSelection({ range, preview }); setLectureQuestionError(undefined) }} />
            : <div className="lecture-empty"><AlertTriangle size={22} /><strong>{lecture?.status === 'missing' ? '本课暂时没有讲义' : '当前讲义暂时无法加载'}</strong><p>课程任务、代码和构建仍可继续使用。{lecture?.status === 'invalid' ? ` 错误：${lecture.errorCode}` : ''}</p></div>}
      </div>

      {lectureSelection && document && <aside className="lecture-question-box"><span>已选讲义</span><blockquote>{lectureSelection.preview}</blockquote><textarea value={lectureQuestion} onChange={(event) => setLectureQuestion(event.target.value)} placeholder="针对这段内容问 AI 助教…" maxLength={1000} />{lectureQuestionError && <small>{lectureQuestionError}</small>}<div><button type="button" onClick={() => setLectureSelection(undefined)}>取消</button><button type="button" className="button-primary" disabled={!lectureQuestion.trim() || busy} onClick={() => { setLectureQuestionError(undefined); void api.askCourseLecture({ courseId: lesson.courseId, lessonId: lesson.lessonId, contentVersion: document.contentVersion, documentDigest: document.documentDigest, workspaceId: workspace.id, request: { selection: lectureSelection.range, question: lectureQuestion } }).then(() => { setLectureSelection(undefined); setLectureQuestion(''); onAssistantOpen('lecture') }).catch(() => setLectureQuestionError('这段选文已失效或 AI 暂时不可用，请重新选择后再试。')) }}>询问 AI</button></div></aside>}

      {document && activeSection && <footer className="lecture-footer-actions">
        <button type="button" onClick={() => setActiveSectionId(document.sections[Math.max(0, activeSection.order - 1)].sectionId)} disabled={activeSection.order === 0}><ArrowLeft size={13} /> 上一节</button>
        <button type="button" onClick={() => setActiveSectionId(document.sections[Math.min(document.sections.length - 1, activeSection.order + 1)].sectionId)} disabled={activeSection.order === document.sections.length - 1}>下一节 <ArrowRight size={13} /></button>
      </footer>}
    </section>}
  </div>
}

function readCourseMode(workspaceId: string): 'tasks' | 'reference' {
  try {
    const stored = JSON.parse(localStorage.getItem(`robotdog.mcu.lab-guide.v1.${workspaceId}`) ?? 'null') as { version?: unknown; kind?: unknown } | null
    return stored?.version === 1 && stored.kind === 'reference' ? 'reference' : 'tasks'
  } catch { return 'tasks' }
}

interface StoredLectureState { sectionId?: string; scrollTop: number }
function lectureStateKey(workspaceId: string, displayedContentVersion: number): string { return `robotdog.mcu-lecture.${workspaceId}.v${displayedContentVersion}` }
function readLectureState(workspaceId: string, displayedContentVersion: number): StoredLectureState {
  try {
    const parsed = JSON.parse(localStorage.getItem(lectureStateKey(workspaceId, displayedContentVersion)) ?? '{}') as Partial<StoredLectureState>
    return { sectionId: typeof parsed.sectionId === 'string' ? parsed.sectionId : undefined, scrollTop: typeof parsed.scrollTop === 'number' && parsed.scrollTop >= 0 ? parsed.scrollTop : 0 }
  } catch { return { scrollTop: 0 } }
}
function writeLectureState(workspaceId: string, displayedContentVersion: number, state: StoredLectureState): void {
  localStorage.setItem(lectureStateKey(workspaceId, displayedContentVersion), JSON.stringify(state))
}

function stepActionLabel(type: string): string {
  if (type === 'candidate-build') return '检查修改'
  if (type === 'review-apply') return '确认差异'
  if (type === 'firmware-build') return '生成程序'
  if (type === 'flash') return '写入开发板'
  if (type === 'question') return '填写回答'
  return '记录完成'
}

function isSystemAction(type: string): boolean {
  return ['candidate-build', 'review-apply', 'firmware-build', 'flash'].includes(type)
}

function stepStatusIcon(item: LabGuideStepModel): React.JSX.Element | string {
  if (item.status === 'completed') return <Check size={14} />
  if (item.status === 'needs-attention') return '!'
  if (item.status === 'current') return <span />
  return String(item.index + 1).padStart(2, '0')
}

function readLectureFontSize(): number {
  const stored = Number(localStorage.getItem('robotdog.mcu-lecture-font-size'))
  return Number.isFinite(stored) && stored >= 13 ? stored : 15
}
