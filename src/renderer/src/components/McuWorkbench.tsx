import { BookOpenCheck, ChevronLeft, Cpu, FolderTree, GraduationCap, PanelLeft, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { CourseLesson, StudentCodeExplanationRequest } from '../../../shared/types'
import { CourseCenter } from './CourseCenter'
import { DiffReview } from './DiffReview'
import { McuBottomPanel } from './McuBottomPanel'
import { McuLabGuide } from './McuCourseTool'
import { McuFloatingAssistant, type FloatingAssistantIntent } from './McuFloatingAssistant'
import { StudentCodeEditor } from './StudentCodeEditor'
import type { WorkbenchProps } from './Workbench'
import { LessonLearnPage } from './LessonLearnPage'
import { McuHome } from './McuHome'
import type { BottomPanelTab } from '../lib/mcu-workspace-model'
import { isFirmwareArtifactCurrent, shouldShowProjectTour } from '../lib/mcu-workspace-model'

type FloatingAssistantIntentInput =
  | { kind: 'workspace-open'; draft?: string }
  | { kind: 'workspace-step'; draft: string }
  | { kind: 'workspace-explanation' }
  | { kind: 'lecture-answer' }

export function McuWorkbench(props: WorkbenchProps): React.JSX.Element {
  const { workspace, candidate, workspaceLesson, courseProgress, busy, course, courseLesson, courses, courseLoading, courseError, courseAttempts, completedLessonIds } = props
  const [showDiff, setShowDiff] = useState(false)
  const [focusRequest, setFocusRequest] = useState<{ path: string; line?: number; nonce: number }>()
  const [explorerWidth, setExplorerWidth] = useState(260)
  const [guideWidth, setGuideWidth] = useState(380)
  const [explorerOpen, setExplorerOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourIndex, setTourIndex] = useState(0)
  const [lectureFocus, setLectureFocus] = useState(false)
  const [guideDrawerOpen, setGuideDrawerOpen] = useState(false)
  const [activeFilePath, setActiveFilePath] = useState<string>()
  const [panelRequest, setPanelRequest] = useState<{ tab: BottomPanelTab; nonce: number }>()
  const [assistantIntent, setAssistantIntent] = useState<FloatingAssistantIntent>()
  const shellRef = useRef<HTMLElement>(null)
  const hasProjectTour = shouldShowProjectTour(workspace, workspaceLesson)
  const openPanel = (tab: BottomPanelTab): void => setPanelRequest({ tab, nonce: Date.now() })
  const openAssistant = (intent: FloatingAssistantIntentInput): void => setAssistantIntent({ ...intent, nonce: Date.now() } as FloatingAssistantIntent)

  useEffect(() => {
    if (!workspace) return
    for (const key of ['robotdog.mcu-explorer-width', 'robotdog.mcu-tool-width', 'robotdog.mcu-tool-panel-open', `robotdog.mcu-tool.${workspace.id}`, `robotdog.mcu-course-mode.${workspace.id}`]) localStorage.removeItem(key)
    const stored = readWorkspacePreference(workspace.id)
    setExplorerWidth(stored.explorerWidth)
    setGuideWidth(stored.guideWidth)
    setExplorerOpen(!stored.explorerCollapsed)
  }, [workspace?.id])

  useEffect(() => {
    if (!workspace) return
    localStorage.setItem(`robotdog.mcu.workspace-ui.v1.${workspace.id}`, JSON.stringify({ version: 1, explorerWidth, guideWidth, explorerCollapsed: !explorerOpen }))
  }, [workspace?.id, explorerWidth, guideWidth, explorerOpen])

  useEffect(() => {
    if (candidate && candidate.workspaceId === workspace?.id && ['review_ready', 'build_passed', 'awaiting_apply'].includes(candidate.state)) setShowDiff(true)
    if (!candidate || candidate.workspaceId !== workspace?.id) setShowDiff(false)
  }, [candidate?.id, candidate?.state, candidate?.workspaceId, workspace?.id])

  useEffect(() => {
    const destination = props.learningDestination
    if (!destination) return
    if (destination === 'chat') openAssistant({ kind: 'workspace-open' })
    else if (destination === '修改确认') setShowDiff(true)
    else if (destination === '编译 / 烧录') openPanel('build')
    props.onLearningDestinationHandled()
  }, [props.learningDestination])

  useEffect(() => {
    if (!hasProjectTour) { setTourOpen(false); setTourIndex(0); return }
    if (!localStorage.getItem('robotdog.mcu-project-tour-seen')) { setTourIndex(0); setTourOpen(true) }
  }, [hasProjectTour, workspace?.id])

  const view = props.mcuView ?? { kind: 'home' as const, panel: 'landing' as const }
  const navigate = props.onMcuNavigate ?? (() => undefined)
  if (view.kind === 'home') return <McuHome panel={view.panel} course={course} workspaces={props.mcuWorkspaces ?? []} learning={props.lessonLearningProgress ?? []} recent={props.mcuRecentActivity ?? []} busy={busy} onNavigate={navigate} onCreateWorkspace={props.onCreateMcuWorkspace ?? (() => undefined)} />
  if (view.kind === 'course-center') return <section className="mcu-catalog-shell"><button type="button" className="mcu-page-back" onClick={() => navigate({ kind: 'home', panel: 'landing' })}><ChevronLeft size={15} /> 返回首页</button><CourseCenter courses={courses} course={course} lesson={courseLesson} loading={courseLoading} error={courseError} completedLessonIds={completedLessonIds} onSelectLesson={(lessonId) => { props.onSelectCourseLesson(lessonId); if (course) navigate({ kind: 'course-center', courseId: course.courseId, lessonId }) }} onOpenLesson={(lessonId) => { props.onSelectCourseLesson(lessonId); if (course) navigate({ kind: 'lesson', courseId: course.courseId, lessonId }) }} /></section>
  if (view.kind === 'lesson') {
    const selected = courseLesson?.courseId === view.courseId && courseLesson.lessonId === view.lessonId ? courseLesson : undefined
    if (!course || !selected) return <section className="course-center-state"><Cpu className="spin" size={22} /><strong>正在打开课程</strong></section>
    return <LessonLearnPage course={course} lesson={selected} attempts={courseAttempts} onBack={() => navigate({ kind: 'course-center', courseId: view.courseId, lessonId: view.lessonId })} onCreateAttempt={props.onCreateCourseAttempt} onContinueAttempt={props.onContinueCourseAttempt} onProgress={props.onLessonLearningProgressChanged ?? (() => undefined)} />
  }
  if (!workspace || workspace.id !== view.workspaceId) return <section className="course-center-state"><Cpu className="spin" size={22} /><strong>正在打开工程</strong></section>

  const hasGuide = workspace.workspacePurpose === 'mcu-lesson-attempt'
  const focusFile = (path: string, line?: number): void => { setShowDiff(false); setFocusRequest({ path, line, nonce: Date.now() }) }
  const explain = (request: StudentCodeExplanationRequest): void => { props.onExplainCode(request); openAssistant({ kind: 'workspace-explanation' }) }
  const openStep = (step: CourseLesson['steps'][number]): void => {
    if (step.fileTarget) focusFile(step.fileTarget.path, step.fileTarget.line)
    if (['candidate-build', 'firmware-build', 'flash'].includes(step.type)) openPanel(step.type === 'candidate-build' ? 'problems' : 'build')
    if (step.type === 'review-apply') setShowDiff(true)
  }
  const resize = (kind: 'explorer' | 'guide', event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = kind === 'explorer' ? explorerWidth : guideWidth
    const move = (moveEvent: PointerEvent): void => {
      const raw = kind === 'explorer' ? startWidth + moveEvent.clientX - startX : startWidth + startX - moveEvent.clientX
      if (kind === 'explorer') setExplorerWidth(Math.round(Math.max(220, Math.min(340, raw))))
      else setGuideWidth(Math.round(Math.max(300, Math.min(440, raw))))
    }
    const stop = (): void => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', stop) }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', stop)
  }

  const diffLayer = showDiff && candidate ? <div className="mcu-diff-surface"><header><span><FolderTree size={15} /> 修改确认</span><button type="button" onClick={() => setShowDiff(false)} aria-label="返回代码"><X size={16} /></button></header><DiffReview candidate={candidate} diff={props.candidateDiff} loading={props.candidateDiffLoading} error={props.candidateDiffError} history={props.workspaceHistory} busy={busy} onReject={props.onRejectCandidate} onBuild={props.onBuildCandidate} onApply={props.onApplyCandidate} onUndo={props.onUndoWorkspace} surfaceOnly /></div> : undefined
  const artifactCurrent = isFirmwareArtifactCurrent(props.build, workspace)
  const buildForWorkspace = props.build.workspaceId === workspace.id
  const recentlyApplied = /^feat\(student\): apply (?:AI candidate|manual draft) /.test(props.workspaceHistory[0]?.message ?? '')
  const workspaceAction = artifactCurrent ? {
    summary: '程序已生成', primaryLabel: '烧录到开发板', secondaryLabel: '查看构建', onSecondary: () => openPanel('build'),
    onPrimary: () => { openPanel('build'); if (props.wchLink.state === 'target_ready' || props.wchLink.state === 'completed') props.onFlashWchLink(); else if (['connected', 'bootloader'].includes(props.connection.updatePort.state)) props.onStartUpdate(); else props.onProbeWchLink() }, disabled: busy
  } : (recentlyApplied || (buildForWorkspace && props.build.state === 'completed')) ? {
    summary: recentlyApplied ? '修改已保存到项目' : '代码已变化，需要重新生成', primaryLabel: '生成完整程序', secondaryLabel: '查看构建', onSecondary: () => openPanel('build'), onPrimary: props.onBuildFirmware, disabled: busy || props.build.state === 'running'
  } : undefined

  return <section ref={shellRef} className={`mcu-workbench-shell ${hasGuide ? 'has-lab-guide' : 'is-sandbox'} ${lectureFocus ? 'is-reference-expanded' : ''} ${guideDrawerOpen ? 'is-guide-drawer-open' : ''} ${explorerOpen ? 'is-explorer-open' : ''}`} style={{ '--mcu-explorer-width': `${explorerWidth}px`, '--mcu-guide-width': `${guideWidth}px` } as CSSProperties}>
    <div className="mcu-development-area">
      <button type="button" className="mcu-explorer-toggle" onClick={() => setExplorerOpen((value) => !value)} aria-label={explorerOpen ? '收起工程目录' : '打开工程目录'}><PanelLeft size={17} /></button>
      <StudentCodeEditor key={workspace.id} workspace={workspace} candidate={candidate} busy={busy} onCandidateChanged={props.onCandidateChanged} onReadyForReview={() => setShowDiff(true)} onExplainCode={explain} diagnosticHelp={props.diagnosticHelp} onRepairStudentCode={props.onRepairStudentCode} explorerMode focusRequest={focusRequest} onActiveFileChange={setActiveFilePath} editorOverlay={diffLayer} overlayVisible={Boolean(diffLayer)} workspaceAction={workspaceAction} bottomPanel={<McuBottomPanel key={workspace.id} workspace={workspace} candidate={candidate} build={props.build} baseline={props.baseline} connection={props.connection} update={props.update} wchLink={props.wchLink} busy={busy} request={panelRequest} onFocusFile={focusFile} onExplain={explain} onBuildFirmware={props.onBuildFirmware} onCancelBuild={props.onCancelBuild} onToggleUsb={props.onToggleUsb} onStartUpdate={props.onStartUpdate} onCancelUpdate={props.onCancelUpdate} onProbeWchLink={props.onProbeWchLink} onFlashWchLink={props.onFlashWchLink} onCancelWchLink={props.onCancelWchLink} />} />
      <button type="button" className="mcu-explorer-resizer" aria-label="调整工程目录宽度" onPointerDown={(event) => resize('explorer', event)} />
      {hasProjectTour && <button type="button" className="mcu-tour-reopen" onClick={() => { setTourIndex(0); setTourOpen(true) }}><GraduationCap size={14} /> 工程导览</button>}
      {hasProjectTour && tourOpen && <ProjectTour index={tourIndex} onFocus={focusFile} onNext={() => { if (tourIndex < PROJECT_TOUR.length - 1) setTourIndex((value) => value + 1); else { localStorage.setItem('robotdog.mcu-project-tour-seen', '1'); setTourOpen(false) } }} onClose={() => { localStorage.setItem('robotdog.mcu-project-tour-seen', '1'); setTourOpen(false) }} />}
    </div>
    {hasGuide && <><button type="button" className="mcu-guide-toggle" onClick={() => setGuideDrawerOpen((value) => !value)} aria-label={guideDrawerOpen ? '收起实验指南' : '打开实验指南'}><BookOpenCheck size={17} /></button><button type="button" className="mcu-guide-resizer" aria-label="调整实验指南宽度" onPointerDown={(event) => resize('guide', event)} /><aside className="mcu-guide-pane" aria-label="实验指南"><McuLabGuide key={workspace.id} workspace={workspace} lesson={workspaceLesson} progress={courseProgress} busy={busy} activeFilePath={activeFilePath} lectureFocus={lectureFocus} onLectureFocusChange={setLectureFocus} onUpdate={props.onUpdateCourseProgress} onBrowseCourses={() => workspace.courseBinding ? navigate({ kind: 'lesson', courseId: workspace.courseBinding.courseId, lessonId: workspace.courseBinding.lessonId }) : navigate({ kind: 'course-center' })} onOpenStep={openStep} onFocusFile={focusFile} onAssistantOpen={(intent) => intent === 'lecture' ? openAssistant({ kind: 'lecture-answer' }) : openAssistant({ kind: 'workspace-step', draft: '请帮我理解当前实验步骤，并给我一个可以先亲自检查的小提示。' })} /></aside></>}
    <McuFloatingAssistant key={workspace.id} workspace={workspace} edition={props.edition} events={props.agentEvents ?? []} candidate={candidate} running={Boolean(props.agentRunning && props.agentEvents?.some((event) => event.type === 'turn_started' && event.workspaceId === workspace.id))} intent={assistantIntent} onPrompt={props.onAgentPrompt ?? (() => undefined)} onCancel={props.onAgentCancel ?? (() => undefined)} onReject={props.onRejectCandidate} onPermission={props.onAgentPermission ?? (() => undefined)} onOpenSettings={props.onOpenSettings} />
  </section>
}

function readWorkspacePreference(workspaceId: string): { explorerWidth: number; guideWidth: number; explorerCollapsed: boolean } {
  try {
    const value = JSON.parse(localStorage.getItem(`robotdog.mcu.workspace-ui.v1.${workspaceId}`) ?? 'null') as { version?: unknown; explorerWidth?: unknown; guideWidth?: unknown; explorerCollapsed?: unknown } | null
    if (value?.version === 1) return { explorerWidth: clampWidth(value.explorerWidth, 260, 220, 340), guideWidth: clampWidth(value.guideWidth, 380, 300, 440), explorerCollapsed: typeof value.explorerCollapsed === 'boolean' ? value.explorerCollapsed : true }
  } catch { /* default below */ }
  return { explorerWidth: 260, guideWidth: 380, explorerCollapsed: true }
}
function clampWidth(value: unknown, fallback: number, min: number, max: number): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback }

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
  return <aside className="mcu-project-tour" aria-live="polite"><div><span>认识工程 · {index + 1}/{PROJECT_TOUR.length}</span><strong>{step.title}</strong><p>{step.copy}</p><code>{step.path}</code></div><div><button type="button" onClick={onClose}>跳过</button><button type="button" className="button-primary" onClick={onNext}>{index === PROJECT_TOUR.length - 1 ? '完成' : '下一处'}</button></div></aside>
}
