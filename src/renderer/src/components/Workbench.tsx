import { Activity, BookOpenCheck, Cable, CheckSquare2, Code2, Cpu, FileArchive, Gauge, Play, ScrollText, Settings2, ShieldCheck, Square, TerminalSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AgentEvent, CandidateDiff, CandidateSnapshot, CcdFrame, CourseDetail, CourseLesson, CourseProgressSnapshot, CourseProgressUpdate, CourseSummary, DeviceConnectionSnapshot, FirmwareBaselineStatus, FirmwareBuildSnapshot, FirmwareUpdateSnapshot, LessonLearningProgress, LogEntry, McuRecentActivity, RecoverySnapshot, RobotStatus, StudentCodeExplanationRequest, StudentDiagnosticHelp, ToolchainStatus, WchLinkFlashSnapshot, WorkspaceHistoryEntry } from '../../../shared/types'
import { CcdPlot } from './CcdPlot'
import { ConnectionBay } from './ConnectionBay'
import { RecoveryPanel } from './RecoveryPanel'
import { DiffReview } from './DiffReview'
import { DisplaySettings } from './DisplaySettings'
import { StudentCodeEditor } from './StudentCodeEditor'
import type { UiScale } from '../lib/ui-scale'
import type { WorkspaceSummary } from '../../../shared/types'
import type { LearningDestination } from './LearningCenter'
import { toStudentProblem } from '../lib/student-errors'
import { ProblemCard } from './ProblemCard'
import { WchLinkFlasherPanel } from './WchLinkFlasherPanel'
import type { AppEditionProfile } from '../../../shared/edition'
import { CourseCenter } from './CourseCenter'
import { CourseTaskPage } from './CourseTaskPage'
import type { WorkbenchRoute } from './workbench-routes'
import { McuWorkbench } from './McuWorkbench'
import type { McuView } from './mcu-navigation'

export interface WorkbenchProps {
  frame: CcdFrame
  status: RobotStatus
  logs: LogEntry[]
  toolchain?: ToolchainStatus
  baseline?: FirmwareBaselineStatus
  build: FirmwareBuildSnapshot
  connection: DeviceConnectionSnapshot
  update: FirmwareUpdateSnapshot
  recovery: RecoverySnapshot
  wchLink: WchLinkFlashSnapshot
  teacherMode: boolean
  edition: AppEditionProfile
  busy: boolean
  candidate?: CandidateSnapshot
  workspace?: WorkspaceSummary
  candidateDiff?: CandidateDiff
  candidateDiffLoading: boolean
  candidateDiffError?: string
  workspaceHistory: WorkspaceHistoryEntry[]
  uiScale: UiScale
  onUiScaleChange(scale: UiScale): void
  onRejectCandidate(candidateId: string): void
  onBuildCandidate(candidateId: string): void
  onApplyCandidate(candidateId: string): void
  onUndoWorkspace(): void
  onCandidateChanged(candidate?: CandidateSnapshot): void
  onExplainCode(request: StudentCodeExplanationRequest): void
  diagnosticHelp?: StudentDiagnosticHelp
  onRepairStudentCode(candidateId: string): void
  onBuildFirmware: () => void
  onCancelBuild: () => void
  onToggleUsb: () => void
  onStartUpdate: () => void
  onCancelUpdate: () => void
  onStartRecovery: () => void
  onCancelRecovery: () => void
  onProbeWchLink: () => void
  onFlashWchLink: () => void
  onCancelWchLink: () => void
  learningDestination?: LearningDestination
  onLearningDestinationHandled(): void
  courses: CourseSummary[]
  course?: CourseDetail
  courseLesson?: CourseLesson
  courseLoading: boolean
  courseError?: string
  courseAttempts: WorkspaceSummary[]
  onSelectCourseLesson(lessonId: string): void
  onCreateCourseAttempt(lessonId: string): Promise<boolean>
  onContinueCourseAttempt(workspaceId: string): void
  workspaceLesson?: CourseLesson
  courseProgress?: CourseProgressSnapshot
  onUpdateCourseProgress(update: CourseProgressUpdate): Promise<void>
  completedLessonIds: string[]
  agentEvents?: AgentEvent[]
  agentRunning?: boolean
  onAgentPrompt?(message: string): void
  onAgentCancel?(): void
  onAgentPermission?(requestId: string, optionId: string): void
  onOpenSettings?(): void
  mcuView?: McuView
  onMcuNavigate?(view: McuView): void
  onCreateMcuWorkspace?(): void
  lessonLearningProgress?: LessonLearningProgress[]
  onLessonLearningProgressChanged?(progress: LessonLearningProgress): void
  mcuRecentActivity?: McuRecentActivity[]
  mcuWorkspaces?: WorkspaceSummary[]
}

const funTabs = [
  { id: 'line-parameters', label: '巡线参数', icon: Gauge },
  { id: 'ccd', label: 'CCD 曲线', icon: Activity },
  { id: 'serial', label: '串口日志', icon: TerminalSquare },
  { id: 'build', label: '编译 / 烧录', icon: Cpu },
  { id: 'wch-link', label: '烧录器烧录', icon: Cable },
  { id: 'code', label: '编写代码', icon: Code2 },
  { id: 'review', label: '修改确认', icon: ShieldCheck },
  { id: 'settings', label: '设置', icon: Settings2 }
] as const

const mcuTabs = [
  { id: 'course-center', label: '课程中心', icon: BookOpenCheck },
  { id: 'course-tasks', label: '实验任务', icon: CheckSquare2 },
  { id: 'code', label: '工程代码', icon: Code2 },
  { id: 'build', label: '编译与问题', icon: Cpu },
  { id: 'review', label: '修改确认', icon: ShieldCheck },
  { id: 'flash', label: '烧录与运行', icon: Cable },
  { id: 'resources', label: '程序资源', icon: Gauge },
  { id: 'settings', label: '设置', icon: Settings2 }
] as const

export function Workbench(props: WorkbenchProps): React.JSX.Element {
  const { frame, status, logs, toolchain, baseline, build, connection, update, recovery, wchLink, teacherMode, edition, busy, candidate, workspace, candidateDiff, candidateDiffLoading, candidateDiffError, workspaceHistory, uiScale, onUiScaleChange, onRejectCandidate, onBuildCandidate, onApplyCandidate, onUndoWorkspace, onCandidateChanged, onExplainCode, diagnosticHelp, onRepairStudentCode, onBuildFirmware, onCancelBuild, onToggleUsb, onStartUpdate, onCancelUpdate, onStartRecovery, onCancelRecovery, onProbeWchLink, onFlashWchLink, onCancelWchLink, learningDestination, onLearningDestinationHandled, courses, course, courseLesson, courseLoading, courseError, courseAttempts, onSelectCourseLesson, onCreateCourseAttempt, onContinueCourseAttempt, workspaceLesson, courseProgress, onUpdateCourseProgress, completedLessonIds } = props
  const tabs = edition.id === 'mcu-foundations' ? mcuTabs.filter((tab) => tab.id !== 'course-tasks' || workspace?.workspacePurpose === 'mcu-lesson-attempt') : funTabs
  const [activeTab, setActiveTab] = useState<WorkbenchRoute>(edition.id === 'mcu-foundations' ? 'course-center' : 'ccd')
  useEffect(() => { setActiveTab(edition.id === 'mcu-foundations' ? 'course-center' : 'ccd') }, [edition.id])
  useEffect(() => {
    if (edition.id !== 'mcu-foundations' || !workspace) return
    setActiveTab(workspace.workspacePurpose === 'mcu-lesson-attempt' ? 'course-tasks' : 'code')
  }, [edition.id, workspace?.id])
  useEffect(() => { if (candidate?.state === 'build_passed' || (candidate?.state === 'review_ready' && candidate.origin !== 'manual' && !candidate.error)) setActiveTab('review') }, [candidate?.id, candidate?.state, candidate?.error, candidate?.origin])
  useEffect(() => {
    if (learningDestination && learningDestination !== 'chat') {
      const destination: Record<Exclude<LearningDestination, 'chat'>, WorkbenchRoute> = { '编写代码': 'code', '修改确认': 'review', '编译 / 烧录': 'build' }
      setActiveTab(destination[learningDestination]); onLearningDestinationHandled()
    }
  }, [learningDestination, onLearningDestinationHandled])
  const error = frame.center - frame.target
  const buildProgress = build.totalFiles > 0 ? Math.round((build.completedFiles / build.totalFiles) * 100) : 0
  const toolchainReady = Boolean(toolchain?.gcc.ok && toolchain?.objcopy.ok && toolchain?.size.ok)
  const artifactCurrent = build.state === 'completed' && Boolean(workspace && build.proof && build.proof.workspaceId === workspace.id && build.proof.workspaceCommit === workspace.headCommit && build.proof.firmwareBaselineId === workspace.firmwareBaselineId)
  const effectiveBuildState = build.state === 'completed' && !artifactCurrent ? 'idle' : build.state
  const isMcu = edition.id === 'mcu-foundations'
  if (isMcu) return <McuWorkbench {...props} />
  return (
    <section className="workbench">
      <nav className="workbench-tabs" aria-label="工作台标签">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button type="button" className={id === activeTab ? 'active' : ''} key={id} onClick={() => setActiveTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      {activeTab === 'course-center' ? <CourseCenter courses={courses} course={course} lesson={courseLesson} loading={courseLoading} error={courseError} completedLessonIds={completedLessonIds} onSelectLesson={onSelectCourseLesson} onOpenLesson={onSelectCourseLesson} /> : activeTab === 'course-tasks' ? <CourseTaskPage workspace={workspace} lesson={workspaceLesson} progress={courseProgress} busy={busy} onUpdate={onUpdateCourseProgress} onNavigate={setActiveTab} /> : activeTab === 'code' ? <StudentCodeEditor workspace={workspace} candidate={candidate} busy={busy} onCandidateChanged={onCandidateChanged} onReadyForReview={() => setActiveTab('review')} onExplainCode={onExplainCode} diagnosticHelp={diagnosticHelp} onRepairStudentCode={onRepairStudentCode} /> : activeTab === 'review' ? <DiffReview candidate={candidate} diff={candidateDiff} loading={candidateDiffLoading} error={candidateDiffError} history={workspaceHistory} busy={busy} onReject={onRejectCandidate} onBuild={onBuildCandidate} onApply={onApplyCandidate} onUndo={onUndoWorkspace} /> : activeTab === 'settings' ? (
        <DisplaySettings scale={uiScale} toolchain={toolchain} baseline={baseline} onScaleChange={onUiScaleChange} />
      ) : ['wch-link', 'flash'].includes(activeTab) ? (
        <WchLinkFlasherPanel
          snapshot={wchLink}
          build={build}
          workspace={workspace}
          busy={busy}
          onProbe={onProbeWchLink}
          onFlash={onFlashWchLink}
          onCancel={onCancelWchLink}
          onGoBuild={() => setActiveTab('build')}
        />
      ) : activeTab === 'resources' ? (
        <div className="workbench-content firmware-workbench">
          <div className="ccd-summary">
            <div><span className="eyebrow">程序资源</span><h2>{build.size ? '查看代码与数据如何占用芯片存储' : '生成程序后查看资源占用'}</h2><p>text 和 data 主要占用 Flash，data 和 bss 会占用运行时 RAM。</p></div>
          </div>
          {build.size ? <div className="metric-row firmware-size-row">
            <article><span>text</span><strong>{build.size.text}</strong><small>程序代码</small></article>
            <article><span>data</span><strong>{build.size.data}</strong><small>已初始化数据</small></article>
            <article><span>bss</span><strong>{build.size.bss}</strong><small>未初始化数据</small></article>
            <article><span>total</span><strong>{build.size.dec}</strong><small>总体积</small></article>
          </div> : <article className="empty-artifacts"><FileArchive size={18} /> 先到“编译与问题”生成程序，再回来观察资源变化。</article>}
        </div>
      ) : activeTab === 'build' ? (
        <div className="workbench-content firmware-workbench">
          <div className="ccd-summary">
            <div>
              <span className="eyebrow">{isMcu ? '编译、烧录与验证' : '编译与安全下载'}</span>
              <h2>{update.state === 'completed' ? (isMcu ? '新程序已写入开发板' : '新程序已在小马上运行') : build.state === 'running' ? `正在生成：${build.currentFile ?? '准备中'}` : artifactCurrent ? (isMcu ? '实验程序已准备好' : '小马程序已准备好') : build.state === 'completed' ? '代码已变化，需要重新生成程序' : (isMcu ? '先编译，再连接开发板验证' : '无线调试，有线下载')}</h2>
              <p>{isMcu ? '编译日志用于定位 C 代码问题；烧录仍需学生确认，WCH-Link 用于有线写入与恢复。' : '蓝牙负责地面调试，板载 USB 负责稳定下载；WCH-Link 只在教师恢复时使用。'}</p>
            </div>
            <div className={`recognition-badge ${toolchainReady ? 'is-ready' : ''}`}>
              <span className={toolchainReady ? 'valid-dot' : 'invalid-dot'} />
              {toolchainReady ? '工具链就绪' : '检查工具链'}
            </div>
          </div>

          <ConnectionBay
            connection={connection}
            update={update}
            buildState={effectiveBuildState}
            busy={busy}
            onToggleUsb={onToggleUsb}
            onStartUpdate={onStartUpdate}
            onCancelUpdate={onCancelUpdate}
          />

          {teacherMode && <RecoveryPanel recovery={recovery} busy={busy} onStart={onStartRecovery} onCancel={onCancelRecovery} />}

          <div className="firmware-grid">
            <article className="firmware-card">
              <span className="eyebrow">Bundled toolchain</span>
              <h3>WCH GCC12 / OpenOCD</h3>
              <div className="toolchain-list">
                <span><strong>GCC</strong>{toolchain?.gcc.detail ?? '读取中'}</span>
                <span><strong>OBJCPY</strong>{toolchain?.objcopy.ok ? '已发现' : toolchain?.objcopy.detail ?? '读取中'}</span>
                <span><strong>OPENOCD</strong>{toolchain?.openocd.detail ?? '读取中'}</span>
              </div>
            </article>

            <article className="firmware-card build-status-card">
              <span className="eyebrow">Build station</span>
              <h3>{build.state === 'idle' ? '等待生成程序' : build.state === 'failed' ? '生成程序失败' : artifactCurrent ? '程序生成完成' : build.state === 'completed' ? '程序文件已过期' : build.state === 'cancelled' ? '已取消' : '正在生成程序'}</h3>
              <div className="build-progress">
                <span style={{ width: `${buildProgress}%` }} />
              </div>
              <p>{build.completedFiles}/{build.totalFiles || 29} 个源文件 · {build.outputDir ?? '尚未创建输出目录'}</p>
              <div className="firmware-actions">
                <button type="button" className="button-primary" onClick={onBuildFirmware} disabled={busy || build.state === 'running' || !toolchainReady}>
                  <Play size={15} /> 生成程序
                </button>
                <button type="button" onClick={onCancelBuild} disabled={build.state !== 'running'}>
                  <Square size={14} /> 取消
                </button>
              </div>
            </article>
          </div>

          <div className="artifact-row">
            {build.artifacts.length === 0 ? (
              <article className="empty-artifacts"><FileArchive size={18} /> 生成完成后，这里会出现 ELF / HEX / BIN / MAP 程序文件。</article>
            ) : build.artifacts.map((artifact) => (
              <article key={artifact.path}>
                <span>{artifact.kind.toUpperCase()}</span>
                <strong>{artifact.name}</strong>
                <small>{artifact.bytes ? `${Math.round(artifact.bytes / 1024)} KB` : '已生成'}{artifact.sha256 ? ` · ${artifact.sha256.slice(0, 8)}` : ''}</small>
              </article>
            ))}
          </div>

          {build.size && (
            <div className="metric-row firmware-size-row">
              <article><span>text</span><strong>{build.size.text}</strong><small>程序代码</small></article>
              <article><span>data</span><strong>{build.size.data}</strong><small>已初始化数据</small></article>
              <article><span>bss</span><strong>{build.size.bss}</strong><small>未初始化数据</small></article>
              <article><span>total</span><strong>{build.size.dec}</strong><small>十进制体积</small></article>
            </div>
          )}

          {build.proof && <div className={`build-proof-strip ${artifactCurrent ? '' : 'is-stale'}`}>
            <ShieldCheck size={16} />
            <span><strong>{artifactCurrent ? '产物身份已核对' : '产物已过期'}</strong>{build.proof.releaseEligible ? '正式固件基线' : '临时测试基线 · 不可发布'} · 存档 {build.proof.workspaceCommit.slice(0, 7)} · 输入 {build.proof.inputHash.slice(0, 8)}</span>
          </div>}

          {build.state === 'failed' && build.error && <ProblemCard problem={toStudentProblem(build.error, '生成程序失败')} tone="danger" primaryAction={{ label: '重新生成程序', onClick: onBuildFirmware, disabled: busy }} />}

          <div className="firmware-log">
            <div className="log-strip-title"><TerminalSquare size={15} /> 编译日志</div>
            <div className="firmware-log-lines">
              {build.logs.length === 0 ? <span className="empty-log">点击“生成程序”后，技术日志会在这里滚动。</span> : build.logs.slice(-14).map((line, index) => (
                <span key={`${line}-${index}`} className={/error|错误|failed/i.test(line) ? 'error' : /warning|警告/i.test(line) ? 'warning' : ''}>{line}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
      <div className="workbench-content">
        <div className="ccd-summary">
          <div>
            <span className="eyebrow">实时传感器</span>
            <h2>{frame.valid ? `黑线在目标点${error >= 0 ? '右侧' : '左侧'} ${Math.abs(error)} 格` : '等待第一次黑线检测'}</h2>
            <p>{status.connection === 'ready' ? '模拟 CCD 数据已就绪，点击“检测黑线”可刷新。' : '连接机器马后开始读取 CCD。'}</p>
          </div>
          <div className="recognition-badge">
            <span className={frame.valid ? 'valid-dot' : 'invalid-dot'} />
            {frame.valid ? '识别有效' : '等待数据'}
          </div>
        </div>

        <CcdPlot frame={frame} />

        <div className="metric-row">
          <article><span>黑线中心</span><strong>{frame.center}</strong><small>像素位置</small></article>
          <article><span>目标中心</span><strong>{frame.target}</strong><small>理想位置</small></article>
          <article><span>当前偏差</span><strong className={frame.valid && error === 0 ? 'safe-value' : 'accent-value'}>{frame.valid ? `${error > 0 ? '+' : ''}${error}` : '—'}</strong><small>{frame.valid ? (error > 0 ? '需要轻微右转' : error < 0 ? '需要轻微左转' : '保持方向') : '等待数据'}</small></article>
          <article><span>动作状态</span><strong className="action-value">{status.action === 'idle' ? '待命' : status.action}</strong><small>3 秒安全时限</small></article>
        </div>

        <div className="log-strip">
          <div className="log-strip-title"><ScrollText size={15} /> 最近活动</div>
          <div className="log-lines">
            {logs.length === 0 ? <span className="empty-log">连接模拟小马后，这里会显示操作记录。</span> : logs.slice(-3).map((entry) => (
              <span key={entry.id} className={`log-line ${entry.level}`}>
                <time>{new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time>
                {entry.message}
              </span>
            ))}
          </div>
        </div>
      </div>
      )}
    </section>
  )
}
