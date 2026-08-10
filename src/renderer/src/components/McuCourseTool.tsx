import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, BookOpenCheck, Check, ChevronDown, Circle, Expand, FileCode2, ListChecks, Minimize2, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { CourseLectureResult, CourseLectureSelectionRange, CourseLesson, CourseProgressSnapshot, CourseProgressUpdate, WorkspaceSummary } from '../../../shared/types'
import { getRobotApi } from '../lib/browser-demo-api'
import { CourseLectureRenderer } from './CourseLectureRenderer'

interface McuCourseToolProps {
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
  onAssistantOpen(): void
}

const automaticTypes = new Set(['candidate-build', 'firmware-build', 'flash'])

export function McuCourseTool({ workspace, lesson, progress, busy, activeFilePath, lectureFocus, onLectureFocusChange, onUpdate, onBrowseCourses, onOpenStep, onFocusFile, onAssistantOpen }: McuCourseToolProps): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const [mode, setMode] = useState<'tasks' | 'lecture'>(() => readCourseMode(workspace.id))
  const [lecture, setLecture] = useState<CourseLectureResult>()
  const [lectureLoading, setLectureLoading] = useState(false)
  const [activeSectionId, setActiveSectionId] = useState<string>()
  const [highlightedStepId, setHighlightedStepId] = useState<string>()
  const [answer, setAnswer] = useState('')
  const [observation, setObservation] = useState('')
  const [lectureSelection, setLectureSelection] = useState<{ range: CourseLectureSelectionRange; preview: string }>()
  const [lectureQuestion, setLectureQuestion] = useState('')
  const [lectureQuestionError, setLectureQuestionError] = useState<string>()
  const [lectureFontSize, setLectureFontSize] = useState(readLectureFontSize)
  const lectureScrollRef = useRef<HTMLDivElement>(null)
  const restoringScrollRef = useRef(false)
  const nextStep = useMemo(() => lesson?.steps.find((step) => !progress?.steps.find((item) => item.stepId === step.stepId)?.completed), [lesson, progress])
  const question = nextStep?.questionId ? lesson?.reflectionQuestions.find((item) => item.questionId === nextStep.questionId) : undefined
  const currentVersion = Boolean(lesson && workspace.courseBinding?.contentVersion === lesson.contentVersion)
  const document = lecture?.status === 'ready' ? lecture.document : undefined
  const activeSection = document?.sections.find((section) => section.sectionId === activeSectionId) ?? document?.sections[0]
  const relatedSectionId = activeFilePath && document?.codeTargetIndex[activeFilePath]?.[0]

  useEffect(() => {
    setAnswer(question ? progress?.answers[question.questionId] ?? '' : '')
    setObservation(nextStep ? progress?.observations[nextStep.stepId] ?? '' : '')
  }, [progress?.updatedAt, nextStep?.stepId, question?.questionId])

  useEffect(() => {
    localStorage.setItem(`robotdog.mcu-course-mode.${workspace.id}`, mode)
    if (mode !== 'lecture') onLectureFocusChange(false)
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

  if (!lesson || !progress || workspace.workspacePurpose !== 'mcu-lesson-attempt') return <div className="mcu-tool-empty"><BookOpenCheck size={24} /><strong>自由练习项目</strong><p>这个项目不绑定课程。你仍然可以阅读工程、编写代码、生成程序或询问 AI。</p><button type="button" onClick={onBrowseCourses}>浏览课程</button></div>

  const complete = progress.state === 'completed'
  const openLecture = (sectionId?: string): void => {
    if (sectionId && document?.sections.some((section) => section.sectionId === sectionId)) setActiveSectionId(sectionId)
    setMode('lecture')
  }
  const openTask = (stepId: string): void => {
    setHighlightedStepId(stepId)
    setMode('tasks')
  }
  const currentReadStep = currentVersion && activeSection
    ? lesson.steps.find((step) => step.type === 'read' && step.lectureSectionId === activeSection.sectionId)
    : undefined
  const currentReadCompleted = currentReadStep ? progress.steps.find((step) => step.stepId === currentReadStep.stepId)?.completed : undefined

  return <div className={`mcu-course-tool ${mode === 'lecture' ? 'is-lecture-mode' : ''}`}>
    <header className="mcu-tool-heading">
      <div><span className="eyebrow">第 {workspace.courseBinding?.attemptNumber} 次练习</span><h2>{lesson.title}</h2></div>
      <button type="button" className="mcu-text-button" onClick={onBrowseCourses}>全部课程</button>
    </header>

    {!currentVersion && <div className="mcu-version-warning"><AlertTriangle size={15} /><span><strong>最新版讲义 · 仅供参考</strong>此练习基于课程 v{workspace.courseBinding?.contentVersion}，当前课程为 v{lesson.contentVersion}。讲义不会升级原任务和进度。</span></div>}

    <div className="mcu-course-switch" role="tablist" aria-label="课程内容">
      <button type="button" role="tab" aria-selected={mode === 'tasks'} className={mode === 'tasks' ? 'active' : ''} onClick={() => setMode('tasks')}><ListChecks size={14} /> 任务</button>
      <button type="button" role="tab" aria-selected={mode === 'lecture'} className={mode === 'lecture' ? 'active' : ''} onClick={() => openLecture()}><BookOpen size={14} /> 讲义</button>
    </div>

    {mode === 'tasks' ? <>
      <div className={`mcu-progress-line ${complete ? 'is-complete' : progress.state === 'needs-attention' ? 'needs-attention' : ''}`}>
        <span><i style={{ width: `${progress.completionPercent}%` }} /></span><strong>{progress.completedSteps}/{progress.totalSteps}</strong><small>{complete ? '本课已完成' : progress.state === 'needs-attention' ? '需要重新检查' : '学习进度'}</small>
      </div>

      {progress.recoveredFromCorruption && <div className="mcu-compact-warning"><RotateCcw size={14} /> 进度记录已重建，代码没有变化。</div>}
      {lesson.verification === 'pending-hardware-check' && <div className="mcu-compact-warning"><AlertTriangle size={14} /> 本课尚未通过真机检查。</div>}

      <section className="mcu-current-step">
        <span className="eyebrow">{complete ? '完成' : '当前一步'}</span>
        <h3>{nextStep?.title ?? '检查本课完成情况'}</h3>
        <p>{nextStep?.instruction ?? '所有步骤已经记录，可以继续复习或返回课程目录。'}</p>
        {nextStep && <div className="mcu-step-actions">
          {nextStep.lectureSectionId && <button type="button" onClick={() => openLecture(nextStep.lectureSectionId)} disabled={busy || lecture?.status !== 'ready'}><BookOpen size={14} /> 阅读相关讲义</button>}
          {nextStep.fileTarget && <button type="button" onClick={() => onOpenStep(nextStep)} disabled={busy}><FileCode2 size={14} /> 定位代码</button>}
          {!nextStep.fileTarget && !nextStep.lectureSectionId && <button type="button" className="button-primary" onClick={() => onOpenStep(nextStep)} disabled={busy}>{stepActionLabel(nextStep.type)} <ArrowRight size={14} /></button>}
        </div>}
      </section>

      {question && nextStep && <section className="mcu-inline-response"><label>{question.prompt}</label><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="用自己的话写下理解。" /><button type="button" onClick={() => void onUpdate({ kind: 'answer', questionId: question.questionId, answer })} disabled={busy || !answer.trim()}>保存回答</button></section>}
      {nextStep && ['serial-observation', 'hardware-observation'].includes(nextStep.type) && <section className="mcu-inline-response"><label>记录实际观察</label><textarea value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="没有观察到时不要猜测。" /><button type="button" onClick={() => void onUpdate({ kind: 'observation', stepId: nextStep.stepId, observation })} disabled={busy || !observation.trim()}>保存观察</button></section>}

      <details className="mcu-step-list" open={Boolean(highlightedStepId)}>
        <summary><ListChecks size={15} /> 全部步骤 <ChevronDown size={14} /></summary>
        <div>{lesson.steps.map((step, index) => {
          const item = progress.steps.find((entry) => entry.stepId === step.stepId)
          const automatic = automaticTypes.has(step.type)
          const lectureControlled = currentVersion && step.type === 'read' && Boolean(step.lectureSectionId)
          return <article key={step.stepId} className={`${item?.completed ? 'is-complete' : ''} ${highlightedStepId === step.stepId ? 'is-highlighted' : ''}`}>
            <button type="button" aria-label={`${item?.completed ? '取消完成' : '标记完成'}：${step.title}`} disabled={busy || automatic || lectureControlled} onClick={() => void onUpdate({ kind: 'step', stepId: step.stepId, completed: !item?.completed })}>{item?.completed ? <Check size={13} /> : <Circle size={13} />}</button>
            <span><small>{String(index + 1).padStart(2, '0')}</small><strong>{step.title}</strong></span>
            <span className="mcu-step-row-actions">{step.lectureSectionId && <button type="button" onClick={() => openLecture(step.lectureSectionId)} aria-label={`阅读相关讲义：${step.title}`}><BookOpen size={13} /></button>}{step.fileTarget && <button type="button" onClick={() => onOpenStep(step)} aria-label={`定位代码：${step.title}`}><FileCode2 size={13} /></button>}</span>
          </article>
        })}</div>
      </details>

      <details className="mcu-completion-details"><summary>完成条件 · {progress.checks.filter((check) => check.passed).length}/{progress.checks.length}</summary>{progress.checks.map((check, index) => <p key={`${check.type}-${check.target ?? index}`} className={check.passed ? 'is-passed' : ''}>{check.passed ? <Check size={12} /> : <Circle size={12} />}{check.label}</p>)}</details>
    </> : <section className="mcu-lecture-view" style={{ '--lecture-font-size': `${lectureFontSize}px` } as CSSProperties}>
      <div className="lecture-toolbar">
        <label><span>章节</span><select value={activeSection?.sectionId ?? ''} onChange={(event) => setActiveSectionId(event.target.value)} disabled={!document}>{document?.sections.map((section) => <option value={section.sectionId} key={section.sectionId}>{String(section.order + 1).padStart(2, '0')} · {section.title}</option>)}</select></label>
        <div className="lecture-font-controls" aria-label="讲义字号">
          <button type="button" onClick={() => setLectureFontSize((value) => Math.max(13, value - 2))} disabled={lectureFontSize <= 13} aria-label="缩小讲义字号">A−</button>
          <output aria-live="polite">{lectureFontSize}px</output>
          <button type="button" onClick={() => setLectureFontSize((value) => Math.min(19, value + 2))} disabled={lectureFontSize >= 19} aria-label="放大讲义字号">A+</button>
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

      {lectureSelection && <aside className="lecture-question-box"><span>已选讲义</span><blockquote>{lectureSelection.preview}</blockquote><textarea value={lectureQuestion} onChange={(event) => setLectureQuestion(event.target.value)} placeholder="针对这段内容问 AI 助教…" maxLength={1000} />{lectureQuestionError && <small>{lectureQuestionError}</small>}<div><button type="button" onClick={() => setLectureSelection(undefined)}>取消</button><button type="button" className="button-primary" disabled={!lectureQuestion.trim() || busy} onClick={() => { setLectureQuestionError(undefined); void api.askCourseLecture(workspace.id, { selection: lectureSelection.range, question: lectureQuestion }).then(() => { setLectureSelection(undefined); setLectureQuestion(''); onAssistantOpen() }).catch(() => setLectureQuestionError('这段选文已失效或 AI 暂时不可用，请重新选择后再试。')) }}>询问 AI</button></div></aside>}

      {document && activeSection && <footer className="lecture-footer-actions">
        <button type="button" onClick={() => setActiveSectionId(document.sections[Math.max(0, activeSection.order - 1)].sectionId)} disabled={activeSection.order === 0}><ArrowLeft size={13} /> 上一节</button>
        {currentReadStep && <button type="button" className={currentReadCompleted ? '' : 'button-primary'} onClick={() => void onUpdate({ kind: 'lecture-read', stepId: currentReadStep.stepId, sectionId: activeSection.sectionId, lectureContentVersion: document.contentVersion, completed: !currentReadCompleted })} disabled={busy}>{currentReadCompleted ? <><Check size={13} /> 已完成阅读</> : '完成本节阅读'}</button>}
        <button type="button" onClick={() => setActiveSectionId(document.sections[Math.min(document.sections.length - 1, activeSection.order + 1)].sectionId)} disabled={activeSection.order === document.sections.length - 1}>下一节 <ArrowRight size={13} /></button>
      </footer>}
    </section>}
  </div>
}

function readCourseMode(workspaceId: string): 'tasks' | 'lecture' {
  return localStorage.getItem(`robotdog.mcu-course-mode.${workspaceId}`) === 'lecture' ? 'lecture' : 'tasks'
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

function readLectureFontSize(): number {
  const stored = Number(localStorage.getItem('robotdog.mcu-lecture-font-size'))
  return [13, 15, 17, 19].includes(stored) ? stored : 15
}
