export type ConnectionState = 'disconnected' | 'connecting' | 'ready' | 'error'

export type RobotAction =
  | 'walk'
  | 'back'
  | 'turnl'
  | 'turnr'
  | 'stop'
  | 'stand'

export interface RobotStatus {
  connection: ConnectionState
  port?: string
  firmware: string
  action: RobotAction | 'idle'
  lineValid: boolean
  lineCenter: number
  targetCenter: number
  updatedAt: string
}

export interface CcdFrame {
  pixels: number[]
  threshold: number
  center: number
  target: number
  valid: boolean
  capturedAt: string
}

export interface LogEntry {
  id: string
  level: 'info' | 'success' | 'warning' | 'error'
  source: 'system' | 'serial' | 'safety'
  message: string
  timestamp: string
}

export interface AppHealth {
  appVersion: string
  platform: string
  mode: 'simulation' | 'hardware'
  checks: Array<{
    id: string
    label: string
    status: 'ready' | 'pending' | 'unavailable'
    detail: string
  }>
}

export interface ToolStatus {
  ok: boolean
  label: string
  path: string
  version?: string
  detail: string
}

export interface ToolchainStatus {
  bundled: boolean
  root: string
  gcc: ToolStatus
  objcopy: ToolStatus
  size: ToolStatus
  openocd: ToolStatus
}

export type FirmwareBuildState = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface FirmwareBuildArtifact {
  name: string
  path: string
  bytes?: number
  kind: 'elf' | 'hex' | 'bin' | 'map'
}

export interface FirmwareSizeInfo {
  text: number
  data: number
  bss: number
  dec: number
  hex: string
}

export interface FirmwareBuildSnapshot {
  id?: string
  state: FirmwareBuildState
  firmwareRoot: string
  outputDir?: string
  currentFile?: string
  completedFiles: number
  totalFiles: number
  logs: string[]
  artifacts: FirmwareBuildArtifact[]
  size?: FirmwareSizeInfo
  error?: string
  startedAt?: string
  completedAt?: string
}

export type FirmwareBuildEvent =
  | { type: 'snapshot'; snapshot: FirmwareBuildSnapshot }
  | { type: 'log'; line: string; level: 'info' | 'warning' | 'error' | 'success' }
  | { type: 'progress'; snapshot: FirmwareBuildSnapshot }
  | { type: 'completed'; snapshot: FirmwareBuildSnapshot }
  | { type: 'failed'; snapshot: FirmwareBuildSnapshot }
  | { type: 'cancelled'; snapshot: FirmwareBuildSnapshot }

export interface RobotDogApi {
  getHealth(): Promise<AppHealth>
  getStatus(): Promise<RobotStatus>
  connectDemo(): Promise<RobotStatus>
  disconnect(): Promise<RobotStatus>
  runAction(action: RobotAction): Promise<RobotStatus>
  captureCcd(): Promise<CcdFrame>
  getToolchainStatus(): Promise<ToolchainStatus>
  startFirmwareBuild(): Promise<FirmwareBuildSnapshot>
  cancelFirmwareBuild(): Promise<FirmwareBuildSnapshot>
  onStatus(listener: (status: RobotStatus) => void): () => void
  onLog(listener: (entry: LogEntry) => void): () => void
  onCcd(listener: (frame: CcdFrame) => void): () => void
  onFirmwareBuild(listener: (event: FirmwareBuildEvent) => void): () => void
}
