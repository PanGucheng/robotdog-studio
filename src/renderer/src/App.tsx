import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleUserRound, GraduationCap, HelpCircle, Menu, Pencil, Plus, ShieldAlert } from 'lucide-react'
import type { AgentEvent, AgentTurnSnapshot, CandidateDiff, CandidateSnapshot, CcdFrame, CourseDetail, CourseLesson, CourseProgressSnapshot, CourseProgressUpdate, CourseSummary, DeviceConnectionSnapshot, FirmwareBaselineStatus, FirmwareBuildSnapshot, FirmwareUpdateSnapshot, LogEntry, RecoverySnapshot, RobotAction, RobotStatus, StudentCodeExplanationRequest, StudentDiagnosticHelp, ToolchainStatus, WchLinkFlashSnapshot, WorkspaceHistoryEntry, WorkspaceSummary } from '../../shared/types'
import { compactAgentEvents } from '../../shared/agent-event-history'
import { ChatPanel } from './components/ChatPanel'
import { ControlDock } from './components/ControlDock'
import { PipelineRail } from './components/PipelineRail'
import { Workbench } from './components/Workbench'
import { getRobotApi } from './lib/browser-demo-api'
import { applyUiScale, readUiScale, type UiScale } from './lib/ui-scale'
import { LearningCenter, type LearningDestination } from './components/LearningCenter'
import { toStudentErrorMessage } from './lib/student-errors'
import { EDITION_PROFILES, type AppEditionProfile } from '../../shared/edition'

const initialStatus: RobotStatus = {
  connection: 'disconnected',
  firmware: '等待连接',
  action: 'idle',
  lineValid: false,
  lineCenter: 64,
  targetCenter: 64,
  updatedAt: new Date().toISOString()
}

const initialFrame: CcdFrame = {
  pixels: Array.from({ length: 128 }, (_, index) => 206 - Math.round(Math.exp(-Math.pow(index - 70, 2) / 65) * 148)),
  threshold: 126,
  center: 70,
  target: 64,
  valid: false,
  capturedAt: new Date().toISOString()
}

const initialBuild: FirmwareBuildSnapshot = {
  state: 'idle',
  firmwareRoot: 'D:\\RobotDog\\ch32v203-robot-dog',
  completedFiles: 0,
  totalFiles: 29,
  logs: [],
  artifacts: []
}

const initialConnection: DeviceConnectionSnapshot = {
  device: { id: 'RDS-SIM-001', name: '一号训练小马', board: 'CH32V203 RobotDog', hardwareVersion: 'SIM-A' },
  runtime: { state: 'disconnected' },
  updatePort: { state: 'disconnected' },
  updatedAt: new Date().toISOString()
}

const initialUpdate: FirmwareUpdateSnapshot = {
  state: 'idle', progress: 0, bytesWritten: 0, totalBytes: 0, canCancel: false,
  message: '生成程序后，可以通过板载 USB 下载到小马。'
}

const initialRecovery: RecoverySnapshot = { state: 'idle', progress: 0, message: '教师恢复待命', canCancel: false }

const initialWchLink: WchLinkFlashSnapshot = { state: 'idle', progress: 0, message: '连接 WCH-Link 后，可以先检测烧录器和芯片。', canCancel: false, logs: [] }

export function App(): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const [status, setStatus] = useState(initialStatus)
  const [edition, setEdition] = useState<AppEditionProfile>(EDITION_PROFILES['fun-line-following'])
  const [frame, setFrame] = useState(initialFrame)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [toolchain, setToolchain] = useState<ToolchainStatus>()
  const [baseline, setBaseline] = useState<FirmwareBaselineStatus>()
  const [build, setBuild] = useState<FirmwareBuildSnapshot>(initialBuild)
  const [connection, setConnection] = useState<DeviceConnectionSnapshot>(initialConnection)
  const [firmwareUpdate, setFirmwareUpdate] = useState<FirmwareUpdateSnapshot>(initialUpdate)
  const [recovery, setRecovery] = useState<RecoverySnapshot>(initialRecovery)
  const [wchLink, setWchLink] = useState<WchLinkFlashSnapshot>(initialWchLink)
  const [teacherMode, setTeacherMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>()
  const [agentEventsByWorkspace, setAgentEventsByWorkspace] = useState<Record<string, AgentEvent[]>>({})
  const [agentTurn, setAgentTurn] = useState<AgentTurnSnapshot>()
  const [candidate, setCandidate] = useState<CandidateSnapshot>()
  const [candidateDiff, setCandidateDiff] = useState<CandidateDiff>()
  const [candidateDiffLoading, setCandidateDiffLoading] = useState(false)
  const [candidateDiffError, setCandidateDiffError] = useState<string>()
  const [workspaceHistory, setWorkspaceHistory] = useState<WorkspaceHistoryEntry[]>([])
  const [uiScale, setUiScale] = useState<UiScale>(() => readUiScale())
  const [learningOpen, setLearningOpen] = useState(() => localStorage.getItem('robotdog.learning-intro-seen.v1') !== '1')
  const [learningDestination, setLearningDestination] = useState<LearningDestination>()
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [course, setCourse] = useState<CourseDetail>()
  const [courseLesson, setCourseLesson] = useState<CourseLesson>()
  const [courseLoading, setCourseLoading] = useState(false)
  const [courseError, setCourseError] = useState<string>()
  const [workspaceLesson, setWorkspaceLesson] = useState<CourseLesson>()
  const [courseProgress, setCourseProgress] = useState<CourseProgressSnapshot>()
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([])
  const seenAgentEvents = useRef(new Set<string>())
  const turnWorkspaces = useRef(new Map<string, string>())

  useEffect(() => { applyUiScale(uiScale) }, [uiScale])

  useEffect(() => {
    let disposed = false
    if (edition.id !== 'mcu-foundations') {
      setCourses([])
      setCourse(undefined)
      setCourseLesson(undefined)
      setCourseError(undefined)
      return () => { disposed = true }
    }
    setCourseLoading(true)
    setCourseError(undefined)
    void api.listCourses().then(async (items) => {
      if (disposed) return
      setCourses(items)
      if (!items[0]) return
      const detail = await api.getCourse(items[0].courseId)
      if (disposed) return
      setCourse(detail)
      const firstLesson = detail.lessons[0]
      if (firstLesson) {
        const lesson = await api.getCourseLesson(detail.courseId, firstLesson.lessonId)
        if (!disposed) setCourseLesson(lesson)
      }
    }).catch((caught) => {
      if (!disposed) setCourseError(toStudentErrorMessage(caught))
    }).finally(() => {
      if (!disposed) setCourseLoading(false)
    })
    return () => { disposed = true }
  }, [api, edition.id])

  useEffect(() => {
    void api.getEditionProfile().then(setEdition).catch((caught) => setError(toStudentErrorMessage(caught)))
    void api.getStatus().then(setStatus)
    void api.getToolchainStatus().then(setToolchain).catch((caught) => {
      setError(toStudentErrorMessage(caught))
    })
    void api.getFirmwareBaselineStatus().then(setBaseline).catch((caught) => setError(toStudentErrorMessage(caught)))
    void api.getDeviceConnection().then(setConnection)
    void api.getFirmwareUpdate().then(setFirmwareUpdate)
    void api.getRecovery().then(setRecovery)
    void api.getWchLinkFlash().then(setWchLink)
    void api.listWorkspaces().then((items) => {
      setWorkspaces(items)
      setActiveWorkspaceId((current) => current ?? items[0]?.id)
      void Promise.all(items.map(async (workspace) => [workspace.id, await api.listAgentHistory(workspace.id)] as const)).then((histories) => {
        setAgentEventsByWorkspace((current) => {
          const next = { ...current }
          for (const [workspaceId, history] of histories) {
            for (const event of history) {
              seenAgentEvents.current.add(event.eventId)
              if (event.type === 'turn_started') turnWorkspaces.current.set(event.turnId, event.workspaceId)
            }
            const live = next[workspaceId] ?? []
            const liveIds = new Set(live.map((event) => event.eventId))
            next[workspaceId] = compactAgentEvents([...history.filter((event) => !liveIds.has(event.eventId)), ...live])
          }
          return next
        })
      }).catch(() => undefined)
    }).catch((caught) => setError(toStudentErrorMessage(caught)))
    const offStatus = api.onStatus(setStatus)
    const offCcd = api.onCcd(setFrame)
    const offLog = api.onLog((entry) => setLogs((current) => [...current.slice(-49), entry]))
    const offBuild = api.onFirmwareBuild((event) => {
      if ('snapshot' in event) setBuild(event.snapshot)
    })
    const offConnection = api.onDeviceConnection(setConnection)
    const offUpdate = api.onFirmwareUpdate((event) => setFirmwareUpdate(event.snapshot))
    const offRecovery = api.onRecovery((event) => setRecovery(event.snapshot))
    const offWchLink = api.onWchLinkFlash((event) => setWchLink(event.snapshot))
    const offWorkspace = api.onWorkspaceChanged((workspace) => {
      setWorkspaces((current) => [workspace, ...current.filter((item) => item.id !== workspace.id)])
      setActiveWorkspaceId(workspace.id)
    })
    const offCandidate = api.onCandidateChanged((nextCandidate) => {
      setCandidate(nextCandidate)
      void api.listWorkspaces().then(setWorkspaces).catch(() => undefined)
    })
    const offAgent = api.onAgentEvent((event) => {
      if (seenAgentEvents.current.has(event.eventId)) return
      seenAgentEvents.current.add(event.eventId)
      if (event.type === 'turn_started') turnWorkspaces.current.set(event.turnId, event.workspaceId)
      const workspaceId = event.type === 'turn_started' ? event.workspaceId : turnWorkspaces.current.get(event.turnId)
      if (workspaceId) setAgentEventsByWorkspace((current) => ({ ...current, [workspaceId]: compactAgentEvents([...(current[workspaceId] ?? []), event]) }))
      if (event.type === 'candidate_ready') setCandidate(event.candidate)
      if (['completed', 'cancelled', 'failed'].includes(event.type)) setAgentTurn(undefined)
    })
    return () => {
      offStatus()
      offCcd()
      offLog()
      offBuild()
      offConnection()
      offUpdate()
      offRecovery()
      offWchLink()
      offWorkspace()
      offCandidate()
      offAgent()
    }
  }, [api])

  const connected = status.connection === 'ready'
  const statusLabel = useMemo(() => {
    if (status.connection === 'connecting') return '正在连接'
    if (connected) return status.port ?? '已连接'
    return '未连接'
  }, [connected, status.connection, status.port])

  async function run(operation: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      await operation()
    } catch (caught) {
      setError(toStudentErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const connect = (): void => {
    void run(async () => {
      if (connected) await api.disconnect()
      else await api.connectDemo()
    })
  }
  const capture = (): void => { void run(() => api.captureCcd()) }
  const action = (value: RobotAction): void => { void run(() => api.runAction(value)) }
  const buildFirmware = (): void => { void run(async () => {
    if (!activeWorkspaceId) throw new Error('请先新建一个学生对话')
    setBuild(await api.startFirmwareBuild(activeWorkspaceId))
    await refreshCourseProgress(activeWorkspaceId)
  }) }
  const cancelBuild = (): void => { void run(async () => { setBuild(await api.cancelFirmwareBuild()) }) }
  const toggleUsb = (): void => { void run(async () => { setConnection(await api.setDemoUsbConnected(connection.updatePort.state === 'disconnected')) }) }
  const startUpdate = (): void => { void run(async () => {
    if (!activeWorkspaceId) throw new Error('请先选择学生对话')
    setFirmwareUpdate(await api.startFirmwareUpdate(activeWorkspaceId))
  }) }
  const cancelUpdate = (): void => { void run(async () => { setFirmwareUpdate(await api.cancelFirmwareUpdate()) }) }
  const startRecovery = (): void => { void run(async () => { setRecovery(await api.startRecovery()) }) }
  const cancelRecovery = (): void => { void run(async () => { setRecovery(await api.cancelRecovery()) }) }
  const probeWchLink = (): void => { void run(async () => { setWchLink(await api.probeWchLink()) }) }
  const flashWchLink = (): void => { void run(async () => {
    if (!activeWorkspaceId) throw new Error('请先选择学生对话')
    setWchLink(await api.flashWchLink(activeWorkspaceId))
    await refreshCourseProgress(activeWorkspaceId)
  }) }
  const cancelWchLink = (): void => { void run(async () => { setWchLink(await api.cancelWchLink()) }) }
  const createWorkspace = (): void => {
    void run(async () => {
      const workspace = await api.createWorkspace({ studentDisplayName: activeWorkspace?.studentDisplayName ?? (edition.id === 'fun-line-following' ? '林同学' : '学习者') })
      setWorkspaces((current) => [workspace, ...current.filter((item) => item.id !== workspace.id)])
      setActiveWorkspaceId(workspace.id)
    })
  }
  const renameWorkspace = (): void => {
    if (!activeWorkspace) return
    const name = window.prompt('给这个项目起一个容易辨认的名字', activeWorkspace.name)?.trim()
    if (!name || name === activeWorkspace.name) return
    void run(async () => {
      const updated = await api.renameWorkspace(activeWorkspace.id, name)
      setWorkspaces((current) => current.map((workspace) => workspace.id === updated.id ? updated : workspace))
    })
  }
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
  const courseAttempts = courseLesson ? workspaces
    .filter((workspace) => workspace.courseBinding?.courseId === courseLesson.courseId && workspace.courseBinding.lessonId === courseLesson.lessonId)
    .sort((left, right) => (right.courseBinding?.attemptNumber ?? 0) - (left.courseBinding?.attemptNumber ?? 0)) : []
  const activeCandidateId = activeWorkspace?.activeCandidateId
  const agentEvents = activeWorkspaceId ? agentEventsByWorkspace[activeWorkspaceId] ?? [] : []
  const diagnosticHelp = useMemo(() => buildDiagnosticHelp(agentEvents, candidate?.id), [agentEvents, candidate?.id])
  const navigateFromLearning = (destination: LearningDestination): void => {
    setLearningDestination(destination)
    if (destination === 'chat') setTimeout(() => document.querySelector<HTMLTextAreaElement>('[aria-label="告诉 AI 你想学习或修改什么"]')?.focus(), 0)
  }
  const closeLearning = (): void => {
    localStorage.setItem('robotdog.learning-intro-seen.v1', '1')
    setLearningOpen(false)
  }
  const selectCourseLesson = (lessonId: string): void => {
    if (!course) return
    setCourseLoading(true)
    setCourseError(undefined)
    void api.getCourseLesson(course.courseId, lessonId).then(setCourseLesson).catch((caught) => {
      setCourseError(toStudentErrorMessage(caught))
    }).finally(() => setCourseLoading(false))
  }
  const createCourseAttempt = async (lessonId: string): Promise<boolean> => {
    if (!course) return false
    let created: WorkspaceSummary | undefined
    await run(async () => {
      created = await api.createLessonAttempt({
        courseId: course.courseId,
        lessonId,
        studentDisplayName: activeWorkspace?.studentDisplayName ?? '学习者'
      })
      setWorkspaces((current) => [created!, ...current.filter((item) => item.id !== created!.id)])
      setActiveWorkspaceId(created.id)
    })
    return Boolean(created)
  }
  const continueCourseAttempt = (workspaceId: string): void => setActiveWorkspaceId(workspaceId)

  async function refreshCourseProgress(workspaceId = activeWorkspaceId): Promise<void> {
    if (!workspaceId) return
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (workspace?.workspacePurpose !== 'mcu-lesson-attempt') return
    const progress = await api.getCourseProgress(workspaceId)
    setCourseProgress(progress)
    if (progress.state === 'completed') setCompletedLessonIds((current) => current.includes(progress.lessonId) ? current : [...current, progress.lessonId])
  }

  useEffect(() => {
    let disposed = false
    setWorkspaceLesson(undefined)
    setCourseProgress(undefined)
    if (!activeWorkspace?.courseBinding || activeWorkspace.workspacePurpose !== 'mcu-lesson-attempt') return () => { disposed = true }
    void Promise.all([
      api.getCourseLesson(activeWorkspace.courseBinding.courseId, activeWorkspace.courseBinding.lessonId),
      api.getCourseProgress(activeWorkspace.id)
    ]).then(([lesson, progress]) => {
      if (!disposed) { setWorkspaceLesson(lesson); setCourseProgress(progress) }
    }).catch((caught) => { if (!disposed) setError(toStudentErrorMessage(caught)) })
    return () => { disposed = true }
  }, [api, activeWorkspace?.id])

  const updateCourseProgress = async (update: CourseProgressUpdate): Promise<void> => {
    if (!activeWorkspaceId) return
    try {
      const progress = await api.updateCourseProgress(activeWorkspaceId, update)
      setCourseProgress(progress)
      setCompletedLessonIds((current) => progress.state === 'completed' ? current.includes(progress.lessonId) ? current : [...current, progress.lessonId] : current.filter((lessonId) => lessonId !== progress.lessonId))
    }
    catch (caught) { setError(toStudentErrorMessage(caught)) }
  }

  useEffect(() => {
    let disposed = false
    const attempts = workspaces.filter((workspace) => workspace.workspacePurpose === 'mcu-lesson-attempt' && workspace.courseBinding?.courseId === course?.courseId)
    if (!course || attempts.length === 0) { setCompletedLessonIds([]); return () => { disposed = true } }
    void Promise.all(attempts.map((workspace) => api.getCourseProgress(workspace.id).catch(() => undefined))).then((items) => {
      if (!disposed) setCompletedLessonIds([...new Set(items.filter((item) => item?.state === 'completed').map((item) => item!.lessonId))])
    })
    return () => { disposed = true }
  }, [api, course?.courseId, workspaces.map((workspace) => `${workspace.id}:${workspace.updatedAt}`).join('|')])

  useEffect(() => {
    if (['completed', 'failed'].includes(firmwareUpdate.state)) void refreshCourseProgress()
  }, [firmwareUpdate.completedAt, firmwareUpdate.state])

  useEffect(() => {
    let disposed = false
    if (!activeWorkspaceId) { setCandidate(undefined); return }
    if (!activeCandidateId) {
      setCandidate((current) => current?.workspaceId === activeWorkspaceId ? current : undefined)
      return
    }
    void api.getCandidate(activeCandidateId).then((recovered) => {
      if (!disposed) setCandidate(recovered)
    }).catch((caught) => {
      if (!disposed) setError(toStudentErrorMessage(caught))
    })
    return () => { disposed = true }
  }, [api, activeCandidateId, activeWorkspaceId])

  useEffect(() => {
    let disposed = false
    if (!activeWorkspaceId) { setWorkspaceHistory([]); return }
    void api.getWorkspaceHistory(activeWorkspaceId, 20).then((history) => {
      if (!disposed) setWorkspaceHistory(history)
    }).catch((caught) => {
      if (!disposed) setError(toStudentErrorMessage(caught))
    })
    return () => { disposed = true }
  }, [api, activeWorkspace?.headCommit, activeWorkspaceId])

  useEffect(() => {
    let disposed = false
    setCandidateDiff(undefined)
    setCandidateDiffError(undefined)
    if (!candidate || candidate.workspaceId !== activeWorkspaceId || !['review_ready', 'building', 'build_passed', 'awaiting_apply'].includes(candidate.state)) {
      setCandidateDiffLoading(false)
      return
    }
    setCandidateDiffLoading(true)
    void api.getCandidateDiff(candidate.id).then((diff) => {
      if (!disposed) setCandidateDiff(diff)
    }).catch((caught) => {
      if (!disposed) setCandidateDiffError(toStudentErrorMessage(caught))
    }).finally(() => {
      if (!disposed) setCandidateDiffLoading(false)
    })
    return () => { disposed = true }
  }, [api, activeWorkspaceId, candidate?.id, candidate?.diffHash, candidate?.state, candidate?.workspaceId])

  const promptAgent = (message: string): void => {
    if (!activeWorkspace) return
    setCandidate(undefined)
    void api.promptAgent(activeWorkspace.id, message).then(setAgentTurn).catch((caught) => setError(toStudentErrorMessage(caught)))
  }
  const explainCode = (request: StudentCodeExplanationRequest): void => {
    if (!activeWorkspace) return
    void api.explainStudentCode(activeWorkspace.id, request).then(setAgentTurn).catch((caught) => setError(toStudentErrorMessage(caught)))
  }
  const repairStudentCode = (candidateId: string): void => {
    if (!activeWorkspace) return
    void api.repairStudentCode(activeWorkspace.id, candidateId).then(setAgentTurn).catch((caught) => setError(toStudentErrorMessage(caught)))
  }
  const cancelAgent = (): void => { void api.cancelAgent(agentTurn?.turnId) }
  const respondAgentPermission = (requestId: string, optionId: string): void => {
    if (!agentTurn) return
    void api.respondAgentPermission(agentTurn.turnId, requestId, optionId).catch((caught) => setError(toStudentErrorMessage(caught)))
  }
  const rejectCandidate = (candidateId: string): void => {
    void api.rejectCandidate(candidateId).then(() => {
      setCandidate(undefined)
      void api.listWorkspaces().then(setWorkspaces)
    }).catch((caught) => setError(toStudentErrorMessage(caught)))
  }
  const buildCandidate = (candidateId: string): void => {
    void run(async () => { setCandidate(await api.buildCandidate(candidateId)); await refreshCourseProgress() })
  }
  const applyCandidate = (candidateId: string): void => {
    void run(async () => {
      const applied = await api.applyCandidate(candidateId)
      if (applied.state !== 'applied') { setCandidate(applied); return }
      setCandidate(undefined)
      setCandidateDiff(undefined)
      const [items, history] = await Promise.all([api.listWorkspaces(), api.getWorkspaceHistory(applied.workspaceId, 20)])
      setWorkspaces(items)
      setWorkspaceHistory(history)
      setLearningDestination('编译 / 烧录')
    })
  }
  const undoWorkspace = (): void => {
    if (!activeWorkspaceId) return
    void run(async () => {
      const workspace = await api.undoWorkspace(activeWorkspaceId)
      setWorkspaces((current) => [workspace, ...current.filter((item) => item.id !== workspace.id)])
      setWorkspaceHistory(await api.getWorkspaceHistory(activeWorkspaceId, 20))
    })
  }

  return (
    <main className={`studio-shell ${edition.id === 'mcu-foundations' ? 'is-mcu' : ''}`}>
      <header className="topbar">
        <div className="brand-block">
          <button type="button" className="menu-button" aria-label="打开项目菜单"><Menu size={20} /></button>
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <div>
            <h1>RobotDog <em>Studio</em></h1>
            <p>{edition.subtitle}</p>
          </div>
        </div>

        <PipelineRail connected={connected} buildState={build.state} updateState={firmwareUpdate.state} />

        <div className="topbar-actions">
          <div className={`connection-pill ${connected ? 'is-connected' : ''}`}>
            <span /> {statusLabel}
          </div>
          <button type="button" className={`student-pill ${teacherMode ? 'is-teacher' : ''}`} onClick={() => setTeacherMode((current) => !current)} title="切换学生/教师演示模式">
            <CircleUserRound size={17} /> {teacherMode ? '教师模式' : activeWorkspace?.studentDisplayName ?? '学习者'}
          </button>
          {edition.id === 'fun-line-following' && <button type="button" className="learning-button" onClick={() => setLearningOpen(true)}><HelpCircle size={16} /> 操作示范</button>}
          <button type="button" className="emergency-button" onClick={() => action('stop')} disabled={!connected}>
            <ShieldAlert size={18} /> 急停
          </button>
        </div>
      </header>

      <div className="context-bar">
        <span className="workspace-picker"><GraduationCap size={15} />
          {workspaces.length > 0 ? (
            <select aria-label="当前项目" value={activeWorkspaceId} onChange={(event) => setActiveWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {new Date(workspace.createdAt).toLocaleDateString('zh-CN')}</option>)}
            </select>
          ) : <strong>还没有项目</strong>}
          {activeWorkspace && <button type="button" onClick={renameWorkspace} disabled={busy} title="修改当前项目名称"><Pencil size={13} /> 重命名</button>}
          <button type="button" onClick={createWorkspace} disabled={busy} title="从当前版本模板创建独立项目"><Plus size={13} /> 新建项目</button>
        </span>
        <span className={`edition-tag edition-${edition.id}`}>{edition.shortName}</span>
        {activeWorkspace && <span className="checkpoint-tag">存档 {activeWorkspace.headCommit.slice(0, 7)}</span>}
        <span>固件：{status.firmware}</span>
        <span className="simulation-flag">SIMULATION · {teacherMode ? '教师维护' : '学生工作台'}</span>
        {error && <span className="inline-error">{error}</span>}
      </div>

      <div className="studio-grid">
        <ChatPanel workspace={activeWorkspace} edition={edition} events={agentEvents} candidate={candidate} running={Boolean(agentTurn)} onPrompt={promptAgent} onCancel={cancelAgent} onReject={rejectCandidate} onPermission={respondAgentPermission} />
        <Workbench
          frame={frame}
          status={status}
          logs={logs}
          toolchain={toolchain}
          baseline={baseline}
          build={build}
          connection={connection}
          update={firmwareUpdate}
          recovery={recovery}
          wchLink={wchLink}
          teacherMode={teacherMode}
          edition={edition}
          busy={busy || Boolean(agentTurn)}
          candidate={candidate?.workspaceId === activeWorkspaceId ? candidate : undefined}
          workspace={activeWorkspace}
          candidateDiff={candidateDiff}
          candidateDiffLoading={candidateDiffLoading}
          candidateDiffError={candidateDiffError}
          workspaceHistory={workspaceHistory}
          uiScale={uiScale}
          onUiScaleChange={setUiScale}
          onRejectCandidate={rejectCandidate}
          onBuildCandidate={buildCandidate}
          onApplyCandidate={applyCandidate}
          onUndoWorkspace={undoWorkspace}
          onCandidateChanged={setCandidate}
          onExplainCode={explainCode}
          diagnosticHelp={diagnosticHelp}
          onRepairStudentCode={repairStudentCode}
          onBuildFirmware={buildFirmware}
          onCancelBuild={cancelBuild}
          onToggleUsb={toggleUsb}
          onStartUpdate={startUpdate}
          onCancelUpdate={cancelUpdate}
          onStartRecovery={startRecovery}
          onCancelRecovery={cancelRecovery}
          onProbeWchLink={probeWchLink}
          onFlashWchLink={flashWchLink}
          onCancelWchLink={cancelWchLink}
          learningDestination={learningDestination}
          onLearningDestinationHandled={() => setLearningDestination(undefined)}
          courses={courses}
          course={course}
          courseLesson={courseLesson}
          courseLoading={courseLoading}
          courseError={courseError}
          courseAttempts={courseAttempts}
          onSelectCourseLesson={selectCourseLesson}
          onCreateCourseAttempt={createCourseAttempt}
          onContinueCourseAttempt={continueCourseAttempt}
          workspaceLesson={workspaceLesson}
          courseProgress={courseProgress}
          onUpdateCourseProgress={updateCourseProgress}
          completedLessonIds={completedLessonIds}
        />
      </div>

      {edition.id === 'fun-line-following' && <ControlDock connected={connected} busy={busy} onConnect={connect} onCapture={capture} onAction={action} />}
      {edition.id === 'fun-line-following' && <LearningCenter open={learningOpen} onClose={closeLearning} onNavigate={navigateFromLearning} />}
    </main>
  )
}

function buildDiagnosticHelp(events: AgentEvent[], candidateId?: string): StudentDiagnosticHelp | undefined {
  if (!candidateId) return undefined
  const started = [...events].reverse().find((event): event is Extract<AgentEvent, { type: 'turn_started' }> =>
    event.type === 'turn_started' && event.candidateId === candidateId && event.message === '请解释刚才的编译错误')
  if (!started) return undefined
  const turnEvents = events.filter((event) => event.turnId === started.turnId)
  const text = turnEvents.filter((event): event is Extract<AgentEvent, { type: 'assistant_delta' }> => event.type === 'assistant_delta').map((event) => event.text).join('')
  const terminal = turnEvents.find((event) => ['completed', 'failed', 'cancelled'].includes(event.type))
  return { candidateId, state: terminal?.type === 'completed' ? 'ready' : terminal ? 'failed' : 'loading', text: text || undefined }
}
