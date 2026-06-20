import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleUserRound, GraduationCap, Menu, Plus, ShieldAlert } from 'lucide-react'
import type { AgentEvent, AgentTurnSnapshot, CandidateDiff, CandidateSnapshot, CcdFrame, DeviceConnectionSnapshot, FirmwareBuildSnapshot, FirmwareUpdateSnapshot, LogEntry, RecoverySnapshot, RobotAction, RobotStatus, ToolchainStatus, WorkspaceSummary } from '../../shared/types'
import { compactAgentEvents } from '../../shared/agent-event-history'
import { ChatPanel } from './components/ChatPanel'
import { ControlDock } from './components/ControlDock'
import { PipelineRail } from './components/PipelineRail'
import { Workbench } from './components/Workbench'
import { getRobotApi } from './lib/browser-demo-api'

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
  message: '编译固件后，可以通过板载 USB 下载到小马。'
}

const initialRecovery: RecoverySnapshot = { state: 'idle', progress: 0, message: '教师恢复待命', canCancel: false }

export function App(): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const [status, setStatus] = useState(initialStatus)
  const [frame, setFrame] = useState(initialFrame)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [toolchain, setToolchain] = useState<ToolchainStatus>()
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
  const seenAgentEvents = useRef(new Set<string>())
  const turnWorkspaces = useRef(new Map<string, string>())

  useEffect(() => {
    void api.getStatus().then(setStatus)
    void api.getToolchainStatus().then(setToolchain).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught))
    })
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
    }).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
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
      setError(caught instanceof Error ? caught.message : String(caught))
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
  const buildFirmware = (): void => { void run(async () => { setBuild(await api.startFirmwareBuild()) }) }
  const cancelBuild = (): void => { void run(async () => { setBuild(await api.cancelFirmwareBuild()) }) }
  const toggleUsb = (): void => { void run(async () => { setConnection(await api.setDemoUsbConnected(connection.updatePort.state === 'disconnected')) }) }
  const startUpdate = (): void => { void run(async () => { setFirmwareUpdate(await api.startFirmwareUpdate()) }) }
  const cancelUpdate = (): void => { void run(async () => { setFirmwareUpdate(await api.cancelFirmwareUpdate()) }) }
  const startRecovery = (): void => { void run(async () => { setRecovery(await api.startRecovery()) }) }
  const cancelRecovery = (): void => { void run(async () => { setRecovery(await api.cancelRecovery()) }) }
  const createWorkspace = (): void => {
    void run(async () => {
      const workspace = await api.createWorkspace({ name: '巡线基础训练', studentDisplayName: '林同学' })
      setWorkspaces((current) => [workspace, ...current.filter((item) => item.id !== workspace.id)])
      setActiveWorkspaceId(workspace.id)
    })
  }
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
  const activeCandidateId = activeWorkspace?.activeCandidateId
  const agentEvents = activeWorkspaceId ? agentEventsByWorkspace[activeWorkspaceId] ?? [] : []

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
      if (!disposed) setError(caught instanceof Error ? caught.message : String(caught))
    })
    return () => { disposed = true }
  }, [api, activeCandidateId, activeWorkspaceId])

  useEffect(() => {
    let disposed = false
    setCandidateDiff(undefined)
    setCandidateDiffError(undefined)
    if (!candidate || candidate.workspaceId !== activeWorkspaceId || candidate.state !== 'review_ready') {
      setCandidateDiffLoading(false)
      return
    }
    setCandidateDiffLoading(true)
    void api.getCandidateDiff(candidate.id).then((diff) => {
      if (!disposed) setCandidateDiff(diff)
    }).catch((caught) => {
      if (!disposed) setCandidateDiffError(caught instanceof Error ? caught.message : String(caught))
    }).finally(() => {
      if (!disposed) setCandidateDiffLoading(false)
    })
    return () => { disposed = true }
  }, [api, activeWorkspaceId, candidate?.id, candidate?.diffHash, candidate?.state, candidate?.workspaceId])

  const promptAgent = (message: string): void => {
    if (!activeWorkspace) return
    setCandidate(undefined)
    void api.promptAgent(activeWorkspace.id, message).then(setAgentTurn).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
  }
  const cancelAgent = (): void => { void api.cancelAgent(agentTurn?.turnId) }
  const respondAgentPermission = (requestId: string, optionId: string): void => {
    if (!agentTurn) return
    void api.respondAgentPermission(agentTurn.turnId, requestId, optionId).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
  }
  const rejectCandidate = (candidateId: string): void => {
    void api.rejectCandidate(candidateId).then(() => {
      setCandidate(undefined)
      void api.listWorkspaces().then(setWorkspaces)
    }).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))
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
          <button type="button" className="emergency-button" onClick={() => action('stop')} disabled={!connected}>
            <ShieldAlert size={18} /> 急停
          </button>
        </div>
      </header>

      <div className="context-bar">
        <span className="workspace-picker"><GraduationCap size={15} />
          {workspaces.length > 0 ? (
            <select aria-label="当前训练项目" value={activeWorkspaceId} onChange={(event) => setActiveWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.studentDisplayName}</option>)}
            </select>
          ) : <strong>还没有训练项目</strong>}
          <button type="button" onClick={createWorkspace} disabled={busy} title="创建受保护的训练项目"><Plus size={13} /> 新建</button>
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
          build={build}
          connection={connection}
          update={firmwareUpdate}
          recovery={recovery}
          teacherMode={teacherMode}
          busy={busy}
          candidate={candidate?.workspaceId === activeWorkspaceId ? candidate : undefined}
          candidateDiff={candidateDiff}
          candidateDiffLoading={candidateDiffLoading}
          candidateDiffError={candidateDiffError}
          onRejectCandidate={rejectCandidate}
          onBuildFirmware={buildFirmware}
          onCancelBuild={cancelBuild}
          onToggleUsb={toggleUsb}
          onStartUpdate={startUpdate}
          onCancelUpdate={cancelUpdate}
          onStartRecovery={startRecovery}
          onCancelRecovery={cancelRecovery}
        />
      </div>

      <ControlDock connected={connected} busy={busy} onConnect={connect} onCapture={capture} onAction={action} />
    </main>
  )
}
