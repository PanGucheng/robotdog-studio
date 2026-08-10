import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, FlaskConical, History, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent, CourseDetail, CourseLectureResult, CourseLectureSelectionRange, CourseLesson, LessonLearningProgress, WorkspaceSummary } from '../../../shared/types'
import { getRobotApi } from '../lib/browser-demo-api'
import { CourseLectureRenderer } from './CourseLectureRenderer'

interface LessonLearnPageProps {
  course: CourseDetail
  lesson: CourseLesson
  attempts: WorkspaceSummary[]
  onBack(): void
  onCreateAttempt(lessonId: string): Promise<boolean>
  onContinueAttempt(workspaceId: string): void
  onProgress(progress: LessonLearningProgress): void
}

export function LessonLearnPage({ course, lesson, attempts, onBack, onCreateAttempt, onContinueAttempt, onProgress }: LessonLearnPageProps): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const [lecture, setLecture] = useState<CourseLectureResult>()
  const [progress, setProgress] = useState<LessonLearningProgress>()
  const [activeUnitId, setActiveUnitId] = useState<string>()
  const [selection, setSelection] = useState<{ range: CourseLectureSelectionRange; preview: string }>()
  const [question, setQuestion] = useState('')
  const [aiText, setAiText] = useState('')
  const [aiTurnId, setAiTurnId] = useState<string>()
  const [attemptChooser, setAttemptChooser] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [includeOlderHistory, setIncludeOlderHistory] = useState(false)
  const [historyEvents, setHistoryEvents] = useState<AgentEvent[]>([])
  const [progressSaving, setProgressSaving] = useState(false)
  const [attemptStarting, setAttemptStarting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const document = lecture?.status === 'ready' ? lecture.document : undefined
  const units = useMemo(() => groupLearningUnits(document), [document?.documentDigest])
  const activeIndex = Math.max(0, units.findIndex((unit) => unit.root.sectionId === activeUnitId))
  const activeUnit = units[activeIndex]

  useEffect(() => {
    let disposed = false
    void Promise.all([api.getCourseLecture(lesson.courseId, lesson.lessonId), api.getLessonLearningProgress(lesson.courseId, lesson.lessonId)]).then(([nextLecture, nextProgress]) => {
      if (disposed) return
      setLecture(nextLecture); setProgress(nextProgress); onProgress(nextProgress)
      if (nextLecture.status === 'ready') {
        const stored = readLectureView(lesson, nextLecture.document.documentDigest)
        const requested = nextLecture.document.sections.find((section) => section.sectionId === stored.activeSectionId)
        const root = requested ? findOwningUnit(nextLecture.document.sections, requested.sectionId) : nextLecture.document.sections.find((section) => section.level === 2)
        setActiveUnitId(root?.sectionId)
        requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = stored.scrollTopBySection[root?.sectionId ?? ''] ?? 0 })
      }
    }).catch(() => setLecture({ status: 'invalid', errorCode: 'LECTURE_LOAD_FAILED' }))
    return () => { disposed = true }
  }, [api, lesson.courseId, lesson.lessonId, lesson.contentVersion])

  useEffect(() => api.onAgentEvent((event: AgentEvent) => {
    if (!aiTurnId || event.turnId !== aiTurnId) return
    if (event.type === 'assistant_delta') setAiText((current) => current + event.text)
  }), [api, aiTurnId])

  useEffect(() => {
    if (!historyOpen || !document) return
    void api.listCourseLectureHistory(lesson.courseId, lesson.lessonId, includeOlderHistory).then(setHistoryEvents)
  }, [api, historyOpen, includeOlderHistory, lesson.courseId, lesson.lessonId, document?.documentDigest])

  const selectUnit = (sectionId: string): void => {
    const root = document ? findOwningUnit(document.sections, sectionId) : undefined
    if (!root) return
    setActiveUnitId(root.sectionId)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    writeLectureView(lesson, document!.documentDigest, { activeSectionId: root.sectionId, scrollTopBySection: {} })
  }
  const toggleComplete = (): void => {
    if (!activeUnit || !progress || progress.integrityError || progressSaving) return
    const completed = !progress.completedSectionIds.includes(activeUnit.root.sectionId)
    setProgressSaving(true)
    void api.updateLessonLearningProgress(lesson.courseId, lesson.lessonId, { kind: 'section', sectionId: activeUnit.root.sectionId, completed })
      .then((next) => { setProgress(next); onProgress(next) })
      .finally(() => setProgressSaving(false))
  }
  const startLab = (): void => {
    if (attemptStarting) return
    const remaining = units.length - (progress?.completedSectionIds.length ?? 0)
    if (remaining > 0 && !window.confirm(`还有 ${remaining} 个课程章节尚未标记完成。你可以先进入实验，之后随时返回课程。\n\n仍然开始实验吗？`)) return
    if (attempts.length > 0) setAttemptChooser(true)
    else void createAttempt()
  }
  const createAttempt = async (): Promise<void> => {
    if (attemptStarting) return
    setAttemptStarting(true)
    try { await onCreateAttempt(lesson.lessonId) }
    finally { setAttemptStarting(false) }
  }
  const askAi = (): void => {
    if (!document || !selection || !question.trim()) return
    setAiText('')
    void api.askCourseLecture({ courseId: lesson.courseId, lessonId: lesson.lessonId, contentVersion: document.contentVersion, documentDigest: document.documentDigest, request: { selection: selection.range, question } }).then((turn) => { setAiTurnId(turn.turnId); setSelection(undefined); setQuestion('') }).catch(() => setAiText('AI 助教当前无法回答，请稍后再试。'))
  }

  if (!document || !activeUnit) return <section className="lesson-learn-state"><button type="button" onClick={onBack}><ArrowLeft size={15} /> 返回课程</button><BookOpen size={24} /><strong>{lecture?.status === 'invalid' ? '讲义暂时无法加载' : '正在准备课程内容'}</strong></section>
  const allComplete = progress?.completedSectionIds.length === units.length
  const actionAvailability = getLessonActionAvailability({ progressSaving, attemptStarting, integrityError: Boolean(progress?.integrityError) })

  return <section className="lesson-learn-page">
    <header className="lesson-learn-header"><button type="button" onClick={onBack}><ArrowLeft size={15} /> 返回课程</button><div><span>第 {lesson.order + 1} 课</span><strong>{lesson.title}</strong></div><span className="lesson-header-actions"><small>{progress?.completedSectionIds.length ?? 0}/{units.length} 个学习单元</small><button type="button" onClick={() => setHistoryOpen(true)}><History size={14} /> AI 历史</button></span></header>
    <div className="lesson-learn-layout">
      <aside className="lesson-toc"><span className="eyebrow">课程目录</span>{document.sections.map((section) => <button type="button" key={section.sectionId} className={`${section.level === 3 ? 'is-subsection' : ''} ${findOwningUnit(document.sections, section.sectionId)?.sectionId === activeUnit.root.sectionId ? 'active' : ''}`} onClick={() => selectUnit(section.sectionId)}>{section.level === 2 && <i>{progress?.completedSectionIds.includes(section.sectionId) ? <Check size={11} /> : String(units.findIndex((unit) => unit.root.sectionId === section.sectionId) + 1).padStart(2, '0')}</i>}<span>{section.title}</span></button>)}</aside>
      <main className="lesson-reading-surface">
        {progress?.integrityError && <div className="lesson-integrity-warning"><AlertTriangle size={17} /><span><strong>课程资源版本一致性异常</strong>正文仍可阅读，但完成记录已暂停写入。请让课程维护者检查 contentVersion。</span></div>}
        <div className="lesson-reading-scroll" ref={scrollRef} onScroll={(event) => {
          const state = readLectureView(lesson, document.documentDigest)
          writeLectureView(lesson, document.documentDigest, { activeSectionId: activeUnit.root.sectionId, scrollTopBySection: { ...state.scrollTopBySection, [activeUnit.root.sectionId]: event.currentTarget.scrollTop } })
        }}>{activeUnit.sections.map((section) => <CourseLectureRenderer key={section.sectionId} document={document} sectionId={section.sectionId} mode="learn" onOpenSection={selectUnit} onOpenCode={() => undefined} onOpenTask={() => startLab()} onSelection={(range, preview) => setSelection({ range, preview })} />)}
          {activeIndex === units.length - 1 && <section className="lesson-to-lab"><span><Check size={18} /></span><div><small>{allComplete ? '本课知识学习完成' : '接下来，用实验验证知识'}</small><h2>{lesson.title}</h2><ul>{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul><p><strong>实验目标：</strong>{lesson.expectedObservation}</p><button type="button" className="button-primary" onClick={startLab} disabled={actionAvailability.startLabDisabled}><FlaskConical size={16} /> {attemptStarting ? '正在准备实验…' : '开始实验'} <ArrowRight size={14} /></button></div></section>}
        </div>
        <footer className="lesson-reading-footer"><button type="button" onClick={() => selectUnit(units[Math.max(0, activeIndex - 1)].root.sectionId)} disabled={activeIndex === 0}><ArrowLeft size={13} /> 上一节</button><button type="button" className={progress?.completedSectionIds.includes(activeUnit.root.sectionId) ? '' : 'button-primary'} onClick={toggleComplete} disabled={actionAvailability.completeReadingDisabled}>{progressSaving ? '正在保存…' : progress?.completedSectionIds.includes(activeUnit.root.sectionId) ? <><Check size={13} /> 已完成本节</> : '完成本节阅读'}</button><button type="button" onClick={() => selectUnit(units[Math.min(units.length - 1, activeIndex + 1)].root.sectionId)} disabled={activeIndex === units.length - 1}>下一节 <ArrowRight size={13} /></button></footer>
      </main>
    </div>
    {selection && <aside className="lesson-ai-drawer"><header><Sparkles size={16} /><strong>问问课程 AI</strong><button type="button" onClick={() => setSelection(undefined)}>×</button></header><blockquote>{selection.preview}</blockquote><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="针对这段内容提问…" /><button type="button" className="button-primary" onClick={askAi} disabled={!question.trim()}>发送问题</button></aside>}
    {aiText && <aside className="lesson-ai-answer"><header><Sparkles size={15} /> 课程 AI</header><p>{aiText}</p><button type="button" onClick={() => setAiText('')}>关闭</button></aside>}
    {historyOpen && <aside className="lesson-history-drawer"><header><div><span className="eyebrow">COURSE AI</span><strong>课程问答历史</strong></div><button type="button" onClick={() => setHistoryOpen(false)}>×</button></header><label><input type="checkbox" checked={includeOlderHistory} onChange={(event) => setIncludeOlderHistory(event.target.checked)} /> 显示旧版课程回答</label><div>{groupLectureHistory(historyEvents).map((turn) => <article key={turn.turnId}><small>{turn.version === document.contentVersion && turn.digest === document.documentDigest ? `当前课程 v${turn.version}` : `来自课程 v${turn.version}`}</small><strong>{turn.question}</strong><p>{turn.answer || '回答未完成'}</p></article>)}{historyEvents.length === 0 && <p>还没有课程问答记录。</p>}</div></aside>}
    {attemptChooser && <div className="lesson-attempt-overlay" role="dialog" aria-modal="true"><section><header><div><span className="eyebrow">实验记录</span><h2>选择一次实验</h2></div><button type="button" onClick={() => setAttemptChooser(false)}>×</button></header>{attempts.map((attempt) => <button type="button" key={attempt.id} onClick={() => onContinueAttempt(attempt.id)} disabled={attemptStarting}><FlaskConical size={16} /><span><strong>第 {attempt.courseBinding?.attemptNumber} 次实验</strong><small>{attempt.name} · {new Date(attempt.updatedAt).toLocaleString('zh-CN', { hour12: false })}</small></span><ChevronRight size={15} /></button>)}<button type="button" className="button-primary" onClick={() => void createAttempt()} disabled={attemptStarting}>{attemptStarting ? '正在新建实验…' : '新建一次实验'}</button></section></div>}
  </section>
}

export function getLessonActionAvailability(state: { progressSaving: boolean; attemptStarting: boolean; integrityError: boolean }): { completeReadingDisabled: boolean; startLabDisabled: boolean } {
  return {
    completeReadingDisabled: state.progressSaving || state.integrityError,
    startLabDisabled: state.attemptStarting
  }
}

function groupLearningUnits(document?: import('../../../shared/types').CourseLectureDocument): Array<{ root: import('../../../shared/types').CourseLectureSection; sections: import('../../../shared/types').CourseLectureSection[] }> {
  if (!document) return []
  const units: Array<{ root: import('../../../shared/types').CourseLectureSection; sections: import('../../../shared/types').CourseLectureSection[] }> = []
  for (const section of document.sections) {
    if (section.level === 2) units.push({ root: section, sections: [section] })
    else units.at(-1)?.sections.push(section)
  }
  return units
}

function findOwningUnit(sections: import('../../../shared/types').CourseLectureSection[], sectionId: string): import('../../../shared/types').CourseLectureSection | undefined {
  let root: import('../../../shared/types').CourseLectureSection | undefined
  for (const section of sections) {
    if (section.level === 2) root = section
    if (section.sectionId === sectionId) return root
  }
  return undefined
}

interface StoredLectureView { activeSectionId?: string; scrollTopBySection: Record<string, number> }
function lectureViewKey(lesson: CourseLesson, digest: string): string { return `robotdog.lesson-view.${lesson.courseId}.${lesson.lessonId}.v${lesson.contentVersion}.${digest}` }
function readLectureView(lesson: CourseLesson, digest: string): StoredLectureView {
  try {
    const stored = JSON.parse(localStorage.getItem(lectureViewKey(lesson, digest)) ?? '{}') as Partial<StoredLectureView>
    return { activeSectionId: stored.activeSectionId, scrollTopBySection: stored.scrollTopBySection ?? {} }
  } catch { return { scrollTopBySection: {} } }
}
function writeLectureView(lesson: CourseLesson, digest: string, state: StoredLectureView): void { localStorage.setItem(lectureViewKey(lesson, digest), JSON.stringify(state)) }

function groupLectureHistory(events: AgentEvent[]): Array<{ turnId: string; version: number; digest: string; question: string; answer: string }> {
  const turns = new Map<string, { turnId: string; version: number; digest: string; question: string; answer: string }>()
  for (const event of events) {
    if (event.type === 'turn_started' && event.lectureScope) turns.set(event.turnId, { turnId: event.turnId, version: event.lectureScope.contentVersion, digest: event.lectureScope.documentDigest, question: event.message, answer: '' })
    else if (event.type === 'assistant_delta') {
      const turn = turns.get(event.turnId)
      if (turn) turn.answer += event.text
    }
  }
  return [...turns.values()].reverse()
}
