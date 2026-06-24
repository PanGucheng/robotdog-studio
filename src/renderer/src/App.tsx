import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleUserRound, GraduationCap, HelpCircle, Menu, Pencil, Plus, ShieldAlert } from 'lucide-react'
import type { AgentEvent, AgentTurnSnapshot, CandidateDiff, CandidateSnapshot, CcdFrame, DeviceConnectionSnapshot, FirmwareBaselineStatus, FirmwareBuildSnapshot, FirmwareUpdateSnapshot, LogEntry, RecoverySnapshot, RobotAction, RobotStatus, StudentCodeExplanationRequest, StudentDiagnosticHelp, ToolchainStatus, WorkspaceHistoryEntry, WorkspaceSummary } from '../../shared/types'
import { compactAgentEvents } from '../../shared/agent-event-history'
import { ChatPanel } from './components/ChatPanel'
import { ControlDock } from './components/ControlDock'
import { PipelineRail } from './components/PipelineRail'
import { Workbench } from './components/Workbench'
import { getRobotApi } from './lib/browser-demo-api'
import { applyUiScale, readUiScale, type UiScale } from './lib/ui-scale'
import { LearningCenter, type LearningDestination } from './components/LearningCenter'
import { toStudentErrorMessage } from './lib/student-errors'

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

export function App(): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const [status, setStatus] = useState(initialStatus)
  const [frame, setFrame] = useState(initialFrame)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [toolchain, setToolchain] = useState<ToolchainStatus>()
  const [baseline, setBaseline] = useState<FirmwareBaselineStatus>()
  const [build, setBuild] = useState<FirmwareBuildSnapshot>(initialBuild)
  const [connection, setConnection] = useState<DeviceConnectionSnapshot>(initialConnection)
  const [firmwareUpdate, setFirmwareUpdate] = useState<FirmwareUpdateSnapshot>(initialUpdate)
  const [recovery, setRecovery] = useState<RecoverySnapshot>(initialRecovery)
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
  const seenAgentEvents = useRef(new Set<string>())
  const turnWorkspaces = useRef(new Map<string, string>())

  useEffect(() => { applyUiScale(uiScale) }, [uiScale])

  useEffect(() => {
    void api.getStatus().then(setStatus)
    void api.getToolchainStatus().then(setToolchain).catch((caught) => {
      setError(toStudentErrorMessage(caught))
    })
    void api.getFirmwareBaselineStatus().then(setBaseline).catch((caught) => setError(toStudentErrorMessage(caught)))
    void api.getDeviceConnection().then(setConnection)
    void api.getFirmwareUpdate().then(setFirmwareUpdate)
    void api.getRecovery().then(setRecovery)
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
  const createWorkspace = (): void => {
    void run(async () => {
      const workspace = await api.createWorkspace({ studentDisplayName: '林同学' })
      setWorkspaces((current) => [workspace, ...current.filter((item) => item.id !== workspace.id)])
      setActiveWorkspaceId(workspace.id)
    })
  }
  const renameWorkspace = (): void => {
    if (!activeWorkspace) return
    const name = window.prompt('给这次对话起一个容易辨认的名字', activeWorkspace.name)?.trim()
    if (!name || name === activeWorkspace.name) return
    void run(async () => {
      const updated = await api.renameWorkspace(activeWorkspace.id, name)
      setWorkspaces((current) => current.map((workspace) => workspace.id === updated.id ? updated : workspace))
    })
  }
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
  const activeCandidateId = activeWorkspace?.activeCandidateId
  const agentEvents = activeWorkspaceId ? agentEventsByWorkspace[activeWorkspaceId] ?? [] : []
  const diagnosticHelp = useMemo(() => buildDiagnosticHelp(agentEvents, candidate?.id), [agentEvents, candidate?.id])
  const navigateFromLearning = (destination: LearningDestination): void => {
    setLearningDestination(destination)
    if (destination === 'chat') setTimeout(() => document.querySelector<HTMLTextAreaElement>('[aria-label="告诉 AI 你希望机器马做什么"]')?.focus(), 0)
  }
  const closeLearning = (): void => {
    localStorage.setItem('robotdog.learning-intro-seen.v1', '1')
    setLearningOpen(false)
  }

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
    void run(async () => { setCandidate(await api.buildCandidate(candidateId)) })
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
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand-block">
          <button type="button" className="menu-button" aria-label="打开项目菜单"><Menu size={20} /></button>
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></div>
          <div>
            <h1>RobotDog <em>Studio</em></h1>
            <p>巡线教学工作台</p>
          </div>
        </div>

        <PipelineRail connected={connected} buildState={build.state} updateState={firmwareUpdate.state} />

        <div className="topbar-actions">
          <div className={`connection-pill ${connected ? 'is-connected' : ''}`}>
            <span /> {statusLabel}
          </div>
          <button type="button" className={`student-pill ${teacherMode ? 'is-teacher' : ''}`} onClick={() => setTeacherMode((current) => !current)} title="切换学生/教师演示模式">
            <CircleUserRound size={17} /> {teacherMode ? '教师模式' : '林同学'}
          </button>
          <button type="button" className="learning-button" onClick={() => setLearningOpen(true)}><HelpCircle size={16} /> 操作示范</button>
          <button type="button" className="emergency-button" onClick={() => action('stop')} disabled={!connected}>
            <ShieldAlert size={18} /> 急停
          </button>
        </div>
      </header>

      <div className="context-bar">
        <span className="workspace-picker"><GraduationCap size={15} />
          {workspaces.length > 0 ? (
            <select aria-label="当前学生对话" value={activeWorkspaceId} onChange={(event) => setActiveWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {new Date(workspace.createdAt).toLocaleDateString('zh-CN')}</option>)}
            </select>
          ) : <strong>还没有学生对话</strong>}
          {activeWorkspace && <button type="button" onClick={renameWorkspace} disabled={busy} title="修改当前对话名称"><Pencil size={13} /> 重命名</button>}
          <button type="button" onClick={createWorkspace} disabled={busy} title="复制代码模板并创建独立工作区"><Plus size={13} /> 新对话</button>
        </span>
        {activeWorkspace && <span className="checkpoint-tag">存档 {activeWorkspace.headCommit.slice(0, 7)}</span>}
        <span>固件：{status.firmware}</span>
        <span className="simulation-flag">SIMULATION · {teacherMode ? '教师维护' : '学生工作台'}</span>
        {error && <span className="inline-error">{error}</span>}
      </div>

      <div className="studio-grid">
        <ChatPanel workspace={activeWorkspace} events={agentEvents} candidate={candidate} running={Boolean(agentTurn)} onPrompt={promptAgent} onCancel={cancelAgent} onReject={rejectCandidate} onPermission={respondAgentPermission} />
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
          teacherMode={teacherMode}
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
          learningDestination={learningDestination}
          onLearningDestinationHandled={() => setLearningDestination(undefined)}
        />
      </div>

      <ControlDock connected={connected} busy={busy} onConnect={connect} onCapture={capture} onAction={action} />
      <LearningCenter open={learningOpen} onClose={closeLearning} onNavigate={navigateFromLearning} />
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
