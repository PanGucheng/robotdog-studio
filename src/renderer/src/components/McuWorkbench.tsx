import { Bot, BookOpenCheck, ChevronLeft, ChevronRight, Cpu, FolderTree, GraduationCap, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { CourseLesson } from '../../../shared/types'
import { ChatPanel } from './ChatPanel'
import { CourseCenter } from './CourseCenter'
import { DiffReview } from './DiffReview'
import { McuBuildRunTool } from './McuBuildRunTool'
import { McuCourseTool } from './McuCourseTool'
import { StudentCodeEditor } from './StudentCodeEditor'
import type { WorkbenchProps } from './Workbench'
import { LessonLearnPage } from './LessonLearnPage'
import { McuHome } from './McuHome'

type McuToolId = 'course' | 'run' | 'assistant'

export function McuWorkbench(props: WorkbenchProps): React.JSX.Element {
  const { workspace, candidate, workspaceLesson, courseProgress, busy, course, courseLesson, courses, courseLoading, courseError, courseAttempts, completedLessonIds } = props
  const [activeTool, setActiveTool] = useState<McuToolId>(() => workspace?.workspacePurpose === 'mcu-lesson-attempt' ? 'course' : 'assistant')
  const [showDiff, setShowDiff] = useState(false)
  const [focusRequest, setFocusRequest] = useState<{ path: string; line?: number; nonce: number }>()
  const [explorerWidth, setExplorerWidth] = useState(() => readStoredWidth('robotdog.mcu-explorer-width', 260, 220, 340))
  const [toolWidth, setToolWidth] = useState(() => readStoredWidth('robotdog.mcu-tool-width', 390, 340, Number.MAX_SAFE_INTEGER))
  const [tourOpen, setTourOpen] = useState(false)
  const [tourIndex, setTourIndex] = useState(0)
  const [toolPanelOpen, setToolPanelOpen] = useState(() => localStorage.getItem('robotdog.mcu-tool-panel-open') !== '0')
  const [lectureFocus, setLectureFocus] = useState(false)
  const [activeFilePath, setActiveFilePath] = useState<string>()
  const shellRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (workspace) {
      const saved = localStorage.getItem(`robotdog.mcu-tool.${workspace.id}`) as McuToolId | null
      const allowed = workspace.workspacePurpose === 'mcu-lesson-attempt' ? ['course', 'run', 'assistant'] : ['run', 'assistant']
      setActiveTool(saved && allowed.includes(saved) ? saved : workspace.workspacePurpose === 'mcu-lesson-attempt' ? 'course' : 'assistant')
    }
  }, [workspace?.id])

  useEffect(() => {
    if (!workspace) return
    localStorage.setItem(`robotdog.mcu-tool.${workspace.id}`, activeTool)
  }, [activeTool, workspace?.id])

  useEffect(() => {
    if (activeTool !== 'course' || !toolPanelOpen) setLectureFocus(false)
  }, [activeTool, toolPanelOpen])

  useEffect(() => {
    if (candidate && ['review_ready', 'build_passed', 'awaiting_apply'].includes(candidate.state)) {
      setActiveTool('run')
      setToolPanelOpen(true)
      setShowDiff(true)
    }
    if (!candidate) setShowDiff(false)
  }, [candidate?.id, candidate?.state])

  useEffect(() => {
    const destination = props.learningDestination
    if (!destination) return
    if (destination === 'chat') { setActiveTool('assistant'); setToolPanelOpen(true) }
    else if (destination === '修改确认') { setActiveTool('run'); setToolPanelOpen(true); setShowDiff(true) }
    else if (destination === '编译 / 烧录') { setActiveTool('run'); setToolPanelOpen(true) }
    else setShowDiff(false)
    props.onLearningDestinationHandled()
  }, [props.learningDestination])

  useEffect(() => { localStorage.setItem('robotdog.mcu-explorer-width', String(explorerWidth)) }, [explorerWidth])
  useEffect(() => { localStorage.setItem('robotdog.mcu-tool-width', String(toolWidth)) }, [toolWidth])
  useEffect(() => { localStorage.setItem('robotdog.mcu-tool-panel-open', toolPanelOpen ? '1' : '0') }, [toolPanelOpen])
  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const observer = new ResizeObserver(([entry]) => {
      const available = Math.max(340, Math.floor(entry.contentRect.width - 48))
      setToolWidth((current) => Math.min(current, available))
    })
    observer.observe(shell)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (workspace && !localStorage.getItem('robotdog.mcu-project-tour-seen')) { setTourIndex(0); setTourOpen(true) }
  }, [workspace?.id])

  const view = props.mcuView ?? { kind: 'home' as const, panel: 'landing' as const }
  const navigate = props.onMcuNavigate ?? (() => undefined)
  if (view.kind === 'home') return <McuHome panel={view.panel} course={course} workspaces={props.mcuWorkspaces ?? []} learning={props.lessonLearningProgress ?? []} recent={props.mcuRecentActivity ?? []} busy={busy} onNavigate={navigate} onCreateWorkspace={props.onCreateMcuWorkspace ?? (() => undefined)} />
  if (view.kind === 'course-center') return <section className="mcu-catalog-shell">
    <button type="button" className="mcu-page-back" onClick={() => navigate({ kind: 'home', panel: 'landing' })}><ChevronLeft size={15} /> 返回首页</button>
    <CourseCenter courses={courses} course={course} lesson={courseLesson} loading={courseLoading} error={courseError} completedLessonIds={completedLessonIds} onSelectLesson={(lessonId) => { props.onSelectCourseLesson(lessonId); if (course) navigate({ kind: 'course-center', courseId: course.courseId, lessonId }) }} onOpenLesson={(lessonId) => { props.onSelectCourseLesson(lessonId); if (course) navigate({ kind: 'lesson', courseId: course.courseId, lessonId }) }} />
  </section>
  if (view.kind === 'lesson') {
    const selected = courseLesson?.courseId === view.courseId && courseLesson.lessonId === view.lessonId ? courseLesson : undefined
    if (!course || !selected) return <section className="course-center-state"><Cpu className="spin" size={22} /><strong>正在打开课程</strong></section>
    return <LessonLearnPage course={course} lesson={selected} attempts={courseAttempts} busy={busy} onBack={() => navigate({ kind: 'course-center', courseId: view.courseId, lessonId: view.lessonId })} onCreateAttempt={props.onCreateCourseAttempt} onContinueAttempt={props.onContinueCourseAttempt} onProgress={props.onLessonLearningProgressChanged ?? (() => undefined)} />
  }
  if (!workspace || workspace.id !== view.workspaceId) return <section className="course-center-state"><Cpu className="spin" size={22} /><strong>正在打开工程</strong></section>

  const focusFile = (path: string, line?: number): void => {
    setShowDiff(false)
    setFocusRequest({ path, line, nonce: Date.now() })
  }
  const openStep = (step: CourseLesson['steps'][number]): void => {
    if (step.fileTarget) focusFile(step.fileTarget.path, step.fileTarget.line)
    if (['candidate-build', 'review-apply', 'firmware-build', 'flash'].includes(step.type)) { setActiveTool('run'); setToolPanelOpen(true) }
    if (step.type === 'review-apply') setShowDiff(true)
  }
  const toolButtons: Array<{ id: McuToolId; label: string; icon: typeof Cpu; attention?: boolean }> = [
    ...(workspace.workspacePurpose === 'mcu-lesson-attempt' ? [{ id: 'course' as const, label: '实验任务', icon: BookOpenCheck, attention: courseProgress?.state === 'needs-attention' }] : []),
    { id: 'run', label: '构建与运行', icon: Cpu, attention: Boolean(candidate) || props.build.state === 'failed' || props.wchLink.state === 'failed' },
    { id: 'assistant', label: 'AI 助教', icon: Bot, attention: Boolean(props.agentRunning) }
  ]
  const resize = (kind: 'explorer' | 'tool', event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = kind === 'explorer' ? explorerWidth : toolWidth
    const move = (moveEvent: PointerEvent): void => {
      const width = kind === 'explorer' ? startWidth + moveEvent.clientX - startX : startWidth + startX - moveEvent.clientX
      const maximum = kind === 'explorer' ? 340 : Math.max(340, Math.floor((shellRef.current?.getBoundingClientRect().width ?? window.innerWidth) - 48))
      const clamped = Math.round(Math.max(kind === 'explorer' ? 220 : 340, Math.min(maximum, width)))
      if (kind === 'explorer') setExplorerWidth(clamped); else setToolWidth(clamped)
    }
    const stop = (): void => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', stop)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', stop)
  }

  return <section ref={shellRef} className={`mcu-workbench-shell ${toolPanelOpen ? '' : 'is-tool-collapsed'} ${lectureFocus ? 'is-lecture-focus' : ''}`} style={{ '--mcu-explorer-width': `${explorerWidth}px`, '--mcu-tool-width': `${toolWidth}px` } as CSSProperties}>
    <div className="mcu-code-surface">
      <StudentCodeEditor workspace={workspace} candidate={candidate} busy={busy} onCandidateChanged={props.onCandidateChanged} onReadyForReview={() => { setActiveTool('run'); setToolPanelOpen(true); setShowDiff(true) }} onExplainCode={(request) => { setActiveTool('assistant'); setToolPanelOpen(true); props.onExplainCode(request) }} diagnosticHelp={props.diagnosticHelp} onRepairStudentCode={props.onRepairStudentCode} explorerMode focusRequest={focusRequest} onActiveFileChange={setActiveFilePath} />
      {showDiff && candidate && <div className="mcu-diff-surface"><header><span><FolderTree size={15} /> 修改差异</span><button type="button" onClick={() => setShowDiff(false)} aria-label="关闭修改差异"><X size={16} /></button></header><DiffReview candidate={candidate} diff={props.candidateDiff} loading={props.candidateDiffLoading} error={props.candidateDiffError} history={props.workspaceHistory} busy={busy} onReject={props.onRejectCandidate} onBuild={props.onBuildCandidate} onApply={props.onApplyCandidate} onUndo={props.onUndoWorkspace} surfaceOnly /></div>}
      <button type="button" className="mcu-explorer-resizer" aria-label="调整工程目录宽度" onPointerDown={(event) => resize('explorer', event)} />
      <button type="button" className="mcu-tour-reopen" onClick={() => { setTourIndex(0); setTourOpen(true) }}><GraduationCap size={14} /> 工程导览</button>
      {tourOpen && <ProjectTour index={tourIndex} onFocus={focusFile} onNext={() => {
        if (tourIndex < PROJECT_TOUR.length - 1) setTourIndex((value) => value + 1)
        else { localStorage.setItem('robotdog.mcu-project-tour-seen', '1'); setTourOpen(false) }
      }} onClose={() => { localStorage.setItem('robotdog.mcu-project-tour-seen', '1'); setTourOpen(false) }} />}
    </div>

    <button type="button" className="mcu-tool-resizer" aria-label="调整右侧工具区宽度" onPointerDown={(event) => resize('tool', event)} />
    <nav className="mcu-tool-rail" aria-label="课程与开发工具">{toolButtons.map(({ id, label, icon: Icon, attention }) => <button type="button" key={id} className={activeTool === id && toolPanelOpen ? 'active' : ''} onClick={() => { if (activeTool === id) setToolPanelOpen((value) => !value); else { setActiveTool(id); setToolPanelOpen(true) } }} aria-label={`${label}${activeTool === id && toolPanelOpen ? '，点击收起' : ''}`} title={label}><Icon size={18} />{attention && <i />}</button>)}</nav>

    <aside className="mcu-tool-panel" aria-label={toolButtons.find((item) => item.id === activeTool)?.label}>
      {activeTool === 'course' ? <McuCourseTool workspace={workspace} lesson={workspaceLesson} progress={courseProgress} busy={busy} activeFilePath={activeFilePath} lectureFocus={lectureFocus} onLectureFocusChange={setLectureFocus} onUpdate={props.onUpdateCourseProgress} onBrowseCourses={() => workspace.courseBinding ? navigate({ kind: 'lesson', courseId: workspace.courseBinding.courseId, lessonId: workspace.courseBinding.lessonId }) : navigate({ kind: 'course-center' })} onOpenStep={openStep} onFocusFile={focusFile} onAssistantOpen={() => { setLectureFocus(false); setActiveTool('assistant'); setToolPanelOpen(true) }} />
        : activeTool === 'run' ? <McuBuildRunTool workspace={workspace} candidate={candidate} build={props.build} baseline={props.baseline} connection={props.connection} update={props.update} wchLink={props.wchLink} history={props.workspaceHistory} busy={busy} onShowDiff={() => setShowDiff(true)} onFocusFile={focusFile} onBuildCandidate={props.onBuildCandidate} onApplyCandidate={props.onApplyCandidate} onRejectCandidate={props.onRejectCandidate} onUndo={props.onUndoWorkspace} onBuildFirmware={props.onBuildFirmware} onCancelBuild={props.onCancelBuild} onToggleUsb={props.onToggleUsb} onStartUpdate={props.onStartUpdate} onCancelUpdate={props.onCancelUpdate} onProbeWchLink={props.onProbeWchLink} onFlashWchLink={props.onFlashWchLink} onCancelWchLink={props.onCancelWchLink} />
          : <div className="mcu-assistant-tool"><ChatPanel workspace={workspace} edition={props.edition} events={props.agentEvents ?? []} candidate={candidate} running={Boolean(props.agentRunning)} onPrompt={props.onAgentPrompt ?? (() => undefined)} onCancel={props.onAgentCancel ?? (() => undefined)} onReject={props.onRejectCandidate} onPermission={props.onAgentPermission ?? (() => undefined)} compact onOpenSettings={props.onOpenSettings} /></div>}
    </aside>
  </section>
}

function readStoredWidth(key: string, fallback: number, min: number, max: number): number {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
}

const PROJECT_TOUR = [
  { path: 'Startup/startup_ch32v20x_D6.S', title: '启动代码', copy: '芯片复位后最先执行，准备运行环境并进入主程序。它属于固件基线，只读。' },
  { path: 'User/main.c', title: '主程序入口', copy: '初始化时钟和外设，并持续推动机器马的控制循环。' },
  { path: 'Core/Src/student_control.c', title: '课程安全适配层', copy: '把主固件的输入输出转换为课程接口，保护底层实现不被误改。' },
  { path: 'App/Src/experiment.c', title: '你的实验代码', copy: '课程主要在 App 目录练习；开始编写后修改只进入安全草稿。' },
  { path: 'CMakeLists.txt', title: '构建入口', copy: '描述哪些源文件参与编译，以及它们如何组成完整固件。' },
  { path: 'Ld/Link.ld', title: '链接脚本', copy: '规定程序和数据在 Flash、RAM 中的位置，通常只读。' },
  { path: 'Peripheral/inc/ch32v20x_gpio.h', title: '厂商外设库', copy: '提供 GPIO、串口、定时器等芯片外设接口，课程可阅读但不直接修改。' }
] as const

function ProjectTour({ index, onFocus, onNext, onClose }: { index: number; onFocus(path: string): void; onNext(): void; onClose(): void }): React.JSX.Element {
  const step = PROJECT_TOUR[index]
  useEffect(() => { onFocus(step.path) }, [index])
  return <aside className="mcu-project-tour" aria-live="polite"><div><span>认识工程 · {index + 1}/{PROJECT_TOUR.length}</span><strong>{step.title}</strong><p>{step.copy}</p><code>{step.path}</code></div><div><button type="button" onClick={onClose}>跳过</button><button type="button" className="button-primary" onClick={onNext}>{index === PROJECT_TOUR.length - 1 ? '完成导览' : <>下一个 <ChevronRight size={13} /></>}</button></div></aside>
}
