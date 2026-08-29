import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, FlaskConical, History, Sparkles } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  const [activeSectionId, setActiveSectionId] = useState<string>()
  const [selection, setSelection] = useState<{ range: CourseLectureSelectionRange; preview: string }>()
  const [question, setQuestion] = useState('')
  const [aiText, setAiText] = useState('')
  const [aiTurnId, setAiTurnId] = useState<string>()
  const [attemptChooser, setAttemptChooser] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [includeOlderHistory, setIncludeOlderHistory] = useState(false)
  const [historyEvents, setHistoryEvents] = useState<AgentEvent[]>([])
  const [progressSaving, setProgressSaving] = useState(false)
  const [progressError, setProgressError] = useState(false)
  const [attemptStarting, setAttemptStarting] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tocRef = useRef<HTMLElement>(null)
  const tocMarkerRefs = useRef(new Map<string, HTMLElement>())
  const sectionRefs = useRef(new Map<string, HTMLDivElement>())
  const unitRefs = useRef(new Map<string, HTMLDivElement>())
  const visibleSinceRef = useRef(new Map<string, number>())
  const pendingReadRef = useRef(new Set<string>())
  const progressRef = useRef<LessonLearningProgress | undefined>(undefined)
  const restorePendingRef = useRef(true)
  const userInteractedRef = useRef(false)
  const suppressAutoReadUntilRef = useRef(0)
  const readingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [tocTrackGeometry, setTocTrackGeometry] = useState<TocTrackGeometry>()
  const document = lecture?.status === 'ready' ? lecture.document : undefined
  const units = useMemo(() => groupLearningUnits(document), [document?.documentDigest])
  const completedSectionKey = progress?.completedSectionIds.join('\0') ?? ''
  const activeSection = document?.sections.find((section) => section.sectionId === activeSectionId) ?? document?.sections[0]
  const activeUnit = activeSection && document ? findOwningUnit(document.sections, activeSection.sectionId) : units[0]?.root

  useEffect(() => { progressRef.current = progress }, [progress])

  useEffect(() => {
    let disposed = false
    void Promise.all([api.getCourseLecture(lesson.courseId, lesson.lessonId), api.getLessonLearningProgress(lesson.courseId, lesson.lessonId)]).then(([nextLecture, nextProgress]) => {
      if (disposed) return
      setLecture(nextLecture); setProgress(nextProgress); onProgress(nextProgress)
      if (nextLecture.status === 'ready') {
        const stored = readLectureView(lesson, nextLecture.document.documentDigest)
        const requested = nextLecture.document.sections.find((section) => section.sectionId === stored.activeSectionId)
        const initial = requested ?? nextLecture.document.sections[0]
        setActiveSectionId(initial?.sectionId)
        restorePendingRef.current = true
        userInteractedRef.current = false
        suppressAutoReadUntilRef.current = Date.now() + 1_200
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const scroller = scrollRef.current
          if (!scroller) return
          if (stored.scrollTop !== undefined) scroller.scrollTop = stored.scrollTop
          else if (initial) {
            sectionRefs.current.get(initial.sectionId)?.scrollIntoView({ block: 'start' })
            const root = findOwningUnit(nextLecture.document.sections, initial.sectionId)
            scroller.scrollTop += stored.scrollTopBySection[root?.sectionId ?? ''] ?? 0
          }
          restorePendingRef.current = false
        }))
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

  const selectSection = (sectionId: string): void => {
    if (!document || !document.sections.some((section) => section.sectionId === sectionId)) return
    setActiveSectionId(sectionId)
    userInteractedRef.current = false
    visibleSinceRef.current.clear()
    suppressAutoReadUntilRef.current = Date.now() + 1_000
    sectionRefs.current.get(sectionId)?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
    setTocOpen(false)
    const state = readLectureView(lesson, document.documentDigest)
    writeLectureView(lesson, document.documentDigest, { ...state, activeSectionId: sectionId })
  }

  const markRead = (sectionId: string): void => {
    const current = progressRef.current
    if (!current || current.integrityError || current.completedSectionIds.includes(sectionId) || pendingReadRef.current.has(sectionId)) return
    pendingReadRef.current.add(sectionId)
    setProgressSaving(true); setProgressError(false)
    void api.updateLessonLearningProgress(lesson.courseId, lesson.lessonId, { kind: 'section', sectionId, completed: true })
      .then((next) => { progressRef.current = next; setProgress(next); onProgress(next) })
      .catch(() => setProgressError(true))
      .finally(() => {
        pendingReadRef.current.delete(sectionId)
        setProgressSaving(pendingReadRef.current.size > 0)
      })
  }

  const evaluateReadingPosition = (): string | undefined => {
    const scroller = scrollRef.current
    if (!scroller || !document) return undefined
    const scrollerRect = scroller.getBoundingClientRect()
    const currentId = findActiveSectionId(document.sections, sectionRefs.current, scrollerRect.top + 96)
    if (currentId && currentId !== activeSectionId) setActiveSectionId(currentId)
    const now = Date.now()
    for (const unit of units) {
      const element = unitRefs.current.get(unit.root.sectionId)
      if (!element) continue
      const rect = element.getBoundingClientRect()
      const visible = rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom
      if (visible && !visibleSinceRef.current.has(unit.root.sectionId)) visibleSinceRef.current.set(unit.root.sectionId, now)
      if (!visible) { visibleSinceRef.current.delete(unit.root.sectionId); continue }
      if (shouldAutoCompleteReadingUnit({
        unitBottom: rect.bottom,
        viewportTop: scrollerRect.top,
        viewportHeight: scroller.clientHeight,
        visibleSince: visibleSinceRef.current.get(unit.root.sectionId) ?? now,
        now,
        userInteracted: userInteractedRef.current,
        suppressed: restorePendingRef.current || now < suppressAutoReadUntilRef.current
      })) markRead(unit.root.sectionId)
    }
    return currentId
  }

  const handleReadingScroll = (): void => {
    if (!document || !scrollRef.current) return
    const currentId = evaluateReadingPosition()
    const state = readLectureView(lesson, document.documentDigest)
    writeLectureView(lesson, document.documentDigest, { ...state, activeSectionId: currentId ?? activeSectionId, scrollTop: scrollRef.current.scrollTop })
    if (readingTimerRef.current) clearTimeout(readingTimerRef.current)
    readingTimerRef.current = setTimeout(evaluateReadingPosition, 650)
  }

  useEffect(() => () => { if (readingTimerRef.current) clearTimeout(readingTimerRef.current) }, [])

  useLayoutEffect(() => {
    const toc = tocRef.current
    if (!toc || !document) { setTocTrackGeometry(undefined); return }

    const updateTrackGeometry = (): void => {
      const tocRect = toc.getBoundingClientRect()
      const markers = units.flatMap((unit) => {
        const marker = tocMarkerRefs.current.get(unit.root.sectionId)
        if (!marker) return []
        const markerRect = marker.getBoundingClientRect()
        return [{ sectionId: unit.root.sectionId, center: markerRect.top - tocRect.top + toc.scrollTop + markerRect.height / 2 }]
      })
      setTocTrackGeometry(calculateTocTrackGeometry(markers, progress?.completedSectionIds ?? []))
    }

    updateTrackGeometry()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateTrackGeometry)
    resizeObserver?.observe(toc)
    for (const marker of tocMarkerRefs.current.values()) resizeObserver?.observe(marker)
    window.addEventListener('resize', updateTrackGeometry)
    return () => { resizeObserver?.disconnect(); window.removeEventListener('resize', updateTrackGeometry) }
  }, [document?.documentDigest, completedSectionKey, tocOpen, units])

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
  const actionAvailability = getLessonActionAvailability({ attemptStarting })
  const readPercent = units.length ? Math.round(((progress?.completedSectionIds.length ?? 0) / units.length) * 100) : 0

  return <section className="lesson-learn-page">
    <header className="lesson-learn-header"><button type="button" onClick={onBack}><ArrowLeft size={15} /> 返回课程</button><div><span>第 {lesson.order + 1} 课</span><strong>{lesson.title}</strong></div><span className="lesson-header-actions"><button type="button" className="lesson-toc-toggle" onClick={() => setTocOpen(true)}><BookOpen size={14} /> 目录</button><span className="lesson-reading-progress"><small>{progressSaving ? '正在保存已读进度…' : allComplete ? '本课讲义已读完' : `已读 ${progress?.completedSectionIds.length ?? 0}/${units.length}`}</small><i aria-hidden="true"><b style={{ width: `${readPercent}%` }} /></i></span><button type="button" onClick={() => setHistoryOpen(true)}><History size={14} /> AI 历史</button></span></header>
    <div className="lesson-learn-layout">
      <aside ref={tocRef} className={`lesson-toc ${tocOpen ? 'is-open' : ''}`}><span className="eyebrow">课程目录</span><button type="button" className="lesson-toc-close" onClick={() => setTocOpen(false)} aria-label="关闭课程目录">×</button>{tocTrackGeometry && <div className="lesson-toc-track" aria-hidden="true" style={{ top: tocTrackGeometry.top, height: tocTrackGeometry.height }}><i style={{ height: tocTrackGeometry.fillHeight }} /></div>}{document.sections.map((section) => {
        const read = section.level === 2 && progress?.completedSectionIds.includes(section.sectionId)
        const active = section.sectionId === activeSection?.sectionId
        return <button type="button" key={section.sectionId} className={`${section.level === 3 ? 'is-subsection' : ''} ${read ? 'is-read' : ''} ${active ? 'active' : ''}`} aria-current={active ? 'location' : undefined} onClick={() => selectSection(section.sectionId)}>{section.level === 2 && <i ref={(node) => { if (node) tocMarkerRefs.current.set(section.sectionId, node); else tocMarkerRefs.current.delete(section.sectionId) }}>{read ? <Check size={11} /> : <span />}</i>}<span>{section.title}</span></button>
      })}</aside>{tocOpen && <button type="button" className="lesson-toc-scrim" onClick={() => setTocOpen(false)} aria-label="关闭课程目录" />}
      <main className="lesson-reading-surface">
        <div className="lesson-reading-notices">{progress?.integrityError && <div className="lesson-integrity-warning"><AlertTriangle size={17} /><span><strong>课程资源版本一致性异常</strong>正文仍可阅读，但完成记录已暂停写入。请让课程维护者检查 contentVersion。</span></div>}
        {progressError && <div className="lesson-progress-warning"><AlertTriangle size={15} /><span>阅读位置已保留，但已读进度暂未保存。继续阅读时会再次尝试。</span></div>}</div>
        <div className="lesson-reading-scroll" ref={scrollRef} tabIndex={0} aria-label="课程讲义连续阅读区" onPointerDown={() => { userInteractedRef.current = true }} onWheel={() => { userInteractedRef.current = true }} onTouchMove={() => { userInteractedRef.current = true }} onKeyDown={() => { userInteractedRef.current = true }} onScroll={handleReadingScroll}>
          {units.map((unit) => <div className="lesson-reading-unit" data-reading-unit={unit.root.sectionId} key={unit.root.sectionId} ref={(node) => { if (node) unitRefs.current.set(unit.root.sectionId, node); else unitRefs.current.delete(unit.root.sectionId) }}>{unit.sections.map((section) => <div className="lesson-reading-section" id={`lecture-section-${section.sectionId}`} key={section.sectionId} ref={(node) => { if (node) sectionRefs.current.set(section.sectionId, node); else sectionRefs.current.delete(section.sectionId) }}><CourseLectureRenderer document={document} sectionId={section.sectionId} mode="learn" onOpenSection={selectSection} onOpenCode={() => undefined} onOpenTask={() => startLab()} onSelection={(range, preview) => setSelection({ range, preview })} /></div>)}</div>)}
          <section className="lesson-to-lab"><span><Check size={18} /></span><div><small>{allComplete ? '本课讲义已读完' : `还有 ${units.length - (progress?.completedSectionIds.length ?? 0)} 个标题尚未读到，可以稍后继续`}</small><h2>{lesson.title}</h2><ul>{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul><p><strong>实验目标：</strong>{lesson.expectedObservation}</p><button type="button" className="button-primary" onClick={startLab} disabled={actionAvailability.startLabDisabled}><FlaskConical size={16} /> {attemptStarting ? '正在准备实验…' : '开始实验'} <ArrowRight size={14} /></button></div></section>
        </div>
      </main>
    </div>
    {selection && <aside className="lesson-ai-drawer"><header><Sparkles size={16} /><strong>问问课程 AI</strong><button type="button" onClick={() => setSelection(undefined)}>×</button></header><blockquote>{selection.preview}</blockquote><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="针对这段内容提问…" /><button type="button" className="button-primary" onClick={askAi} disabled={!question.trim()}>发送问题</button></aside>}
    {aiText && <aside className="lesson-ai-answer"><header><Sparkles size={15} /> 课程 AI</header><p>{aiText}</p><button type="button" onClick={() => setAiText('')}>关闭</button></aside>}
    {historyOpen && <aside className="lesson-history-drawer"><header><div><span className="eyebrow">COURSE AI</span><strong>课程问答历史</strong></div><button type="button" onClick={() => setHistoryOpen(false)}>×</button></header><label><input type="checkbox" checked={includeOlderHistory} onChange={(event) => setIncludeOlderHistory(event.target.checked)} /> 显示旧版课程回答</label><div>{groupLectureHistory(historyEvents).map((turn) => <article key={turn.turnId}><small>{turn.version === document.contentVersion && turn.digest === document.documentDigest ? `当前课程 v${turn.version}` : `来自课程 v${turn.version}`}</small><strong>{turn.question}</strong><p>{turn.answer || '回答未完成'}</p></article>)}{historyEvents.length === 0 && <p>还没有课程问答记录。</p>}</div></aside>}
    {attemptChooser && <div className="lesson-attempt-overlay" role="dialog" aria-modal="true"><section><header><div><span className="eyebrow">实验记录</span><h2>选择一次实验</h2></div><button type="button" onClick={() => setAttemptChooser(false)}>×</button></header>{attempts.map((attempt) => <button type="button" key={attempt.id} onClick={() => onContinueAttempt(attempt.id)} disabled={attemptStarting}><FlaskConical size={16} /><span><strong>第 {attempt.courseBinding?.attemptNumber} 次实验</strong><small>{attempt.name} · {new Date(attempt.updatedAt).toLocaleString('zh-CN', { hour12: false })}</small></span><ChevronRight size={15} /></button>)}<button type="button" className="button-primary" onClick={() => void createAttempt()} disabled={attemptStarting}>{attemptStarting ? '正在新建实验…' : '新建一次实验'}</button></section></div>}
  </section>
}

export function getLessonActionAvailability(state: { attemptStarting: boolean }): { startLabDisabled: boolean } { return { startLabDisabled: state.attemptStarting } }

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

interface StoredLectureView { activeSectionId?: string; scrollTop?: number; scrollTopBySection: Record<string, number> }
function lectureViewKey(lesson: CourseLesson, digest: string): string { return `robotdog.lesson-view.${lesson.courseId}.${lesson.lessonId}.v${lesson.contentVersion}.${digest}` }
function readLectureView(lesson: CourseLesson, digest: string): StoredLectureView {
  try {
    const stored = JSON.parse(localStorage.getItem(lectureViewKey(lesson, digest)) ?? '{}') as Partial<StoredLectureView>
    return { activeSectionId: stored.activeSectionId, scrollTop: typeof stored.scrollTop === 'number' && stored.scrollTop >= 0 ? stored.scrollTop : undefined, scrollTopBySection: stored.scrollTopBySection ?? {} }
  } catch { return { scrollTopBySection: {} } }
}
function writeLectureView(lesson: CourseLesson, digest: string, state: StoredLectureView): void { localStorage.setItem(lectureViewKey(lesson, digest), JSON.stringify(state)) }

export function shouldAutoCompleteReadingUnit(input: { unitBottom: number; viewportTop: number; viewportHeight: number; visibleSince: number; now: number; userInteracted: boolean; suppressed: boolean }): boolean {
  return input.userInteracted && !input.suppressed && input.now - input.visibleSince >= 600 && input.unitBottom > input.viewportTop && input.unitBottom <= input.viewportTop + input.viewportHeight * 0.72
}

interface TocTrackGeometry { top: number; height: number; fillHeight: number }
interface TocMarkerPosition { sectionId: string; center: number }

export function calculateTocTrackGeometry(markers: TocMarkerPosition[], completedSectionIds: string[]): TocTrackGeometry | undefined {
  const first = markers[0]
  const last = markers.at(-1)
  if (!first || !last) return undefined
  const completed = new Set(completedSectionIds)
  let lastCompleted: TocMarkerPosition | undefined
  for (const marker of markers) {
    if (completed.has(marker.sectionId)) lastCompleted = marker
  }
  return {
    top: first.center,
    height: Math.max(0, last.center - first.center),
    fillHeight: lastCompleted ? Math.max(0, lastCompleted.center - first.center) : 0
  }
}

function findActiveSectionId(sections: import('../../../shared/types').CourseLectureSection[], refs: Map<string, HTMLDivElement>, readingLine: number): string | undefined {
  let active = sections[0]?.sectionId
  for (const section of sections) {
    const element = refs.get(section.sectionId)
    if (!element) continue
    if (element.getBoundingClientRect().top > readingLine) break
    active = section.sectionId
  }
  return active
}

function reducedMotion(): boolean { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false }

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
