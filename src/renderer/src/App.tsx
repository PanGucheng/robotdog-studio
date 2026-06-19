import { useEffect, useMemo, useState } from 'react'
import { CircleUserRound, GraduationCap, Menu, ShieldAlert } from 'lucide-react'
import type { CcdFrame, FirmwareBuildSnapshot, LogEntry, RobotAction, RobotStatus, ToolchainStatus } from '../../shared/types'
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

export function App(): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const [status, setStatus] = useState(initialStatus)
  const [frame, setFrame] = useState(initialFrame)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [toolchain, setToolchain] = useState<ToolchainStatus>()
  const [build, setBuild] = useState<FirmwareBuildSnapshot>(initialBuild)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    void api.getStatus().then(setStatus)
    void api.getToolchainStatus().then(setToolchain).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught))
    })
    const offStatus = api.onStatus(setStatus)
    const offCcd = api.onCcd(setFrame)
    const offLog = api.onLog((entry) => setLogs((current) => [...current.slice(-49), entry]))
    const offBuild = api.onFirmwareBuild((event) => {
      if ('snapshot' in event) setBuild(event.snapshot)
    })
    return () => {
      offStatus()
      offCcd()
      offLog()
      offBuild()
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

        <PipelineRail connected={connected} />

        <div className="topbar-actions">
          <div className={`connection-pill ${connected ? 'is-connected' : ''}`}>
            <span /> {statusLabel}
          </div>
          <button type="button" className="student-pill"><CircleUserRound size={17} /> 林同学</button>
          <button type="button" className="emergency-button" onClick={() => action('stop')} disabled={!connected}>
            <ShieldAlert size={18} /> 急停
          </button>
        </div>
      </header>

      <div className="context-bar">
        <span><GraduationCap size={15} /> 当前项目：巡线基础训练</span>
        <span>固件：{status.firmware}</span>
        <span className="simulation-flag">SIMULATION · 阶段 0</span>
        {error && <span className="inline-error">{error}</span>}
      </div>

      <div className="studio-grid">
        <ChatPanel />
        <Workbench
          frame={frame}
          status={status}
          logs={logs}
          toolchain={toolchain}
          build={build}
          busy={busy}
          onBuildFirmware={buildFirmware}
          onCancelBuild={cancelBuild}
        />
      </div>

      <ControlDock connected={connected} busy={busy} onConnect={connect} onCapture={capture} onAction={action} />
    </main>
  )
}
