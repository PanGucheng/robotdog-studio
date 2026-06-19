export type ConnectionState = 'disconnected' | 'connecting' | 'ready' | 'error'

export type RuntimeLinkState = 'disconnected' | 'discovering' | 'connecting' | 'handshaking' | 'ready' | 'degraded' | 'retrying' | 'error'
export type UpdatePortState = 'disconnected' | 'connected' | 'bootloader' | 'busy' | 'error'

export interface DeviceIdentity {
  id: string
  name: string
  board: string
  hardwareVersion: string
}

export interface DeviceConnectionSnapshot {
  device: DeviceIdentity
  runtime: {
    state: RuntimeLinkState
    port?: string
    firmware?: string
    latencyMs?: number
  }
  updatePort: {
    state: UpdatePortState
    port?: string
    bootloaderVersion?: string
  }
  updatedAt: string
}

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

export type WorkspaceState = 'ready' | 'candidate_active' | 'applying' | 'error' | 'conflict' | 'archived'

export interface CreateWorkspaceInput {
  name: string
  studentDisplayName: string
  templateId?: 'ch32v203-robotdog'
}

export interface WorkspaceMetadata {
  schemaVersion: 1
  id: string
  name: string
  studentDisplayName: string
  templateId: 'ch32v203-robotdog'
  templateVersion: string
  createdAt: string
  updatedAt: string
  activeBranch: 'main'
  lastCheckpoint: string
  policyProfile: 'student-v1'
  state: WorkspaceState
  activeCandidateId?: string
}

export interface WorkspaceSummary {
  id: string
  name: string
  studentDisplayName: string
  templateId: 'ch32v203-robotdog'
  templateVersion: string
  headCommit: string
  state: WorkspaceState
  updatedAt: string
  activeCandidateId?: string
}

export type CandidateState =
  | 'preparing' | 'agent_running' | 'validating' | 'review_ready' | 'no_changes'
  | 'building' | 'build_passed' | 'awaiting_apply' | 'applying' | 'applied'
  | 'rejected' | 'cancelled' | 'failed' | 'stale' | 'conflict'

export interface PatchViolation {
  code: string
  path?: string
  message: string
}

export interface PatchFileSummary {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'type_changed' | 'unmerged'
  bytes: number
  additions: number
  deletions: number
}

export interface PatchValidationReport {
  valid: boolean
  policyVersion: string
  files: PatchFileSummary[]
  violations: PatchViolation[]
  warnings: PatchViolation[]
  changedFiles: number
  patchBytes: number
}

export interface CandidateSnapshot {
  id: string
  workspaceId: string
  state: CandidateState
  baseCommit: string
  baseTreeHash: string
  policyVersion: string
  createdAt: string
  expiresAt: string
  updatedAt: string
  sourceTreeHash?: string
  diffHash?: string
  validation?: PatchValidationReport
  error?: string
}

export interface CandidateDiffFile {
  path: string
  status: PatchFileSummary['status']
  before: string
  after: string
  additions: number
  deletions: number
}

export interface CandidateDiff {
  candidateId: string
  diffHash: string
  files: CandidateDiffFile[]
}

export interface WorkspaceHistoryEntry {
  commit: string
  shortCommit: string
  message: string
  createdAt: string
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

export type FirmwareUpdateState =
  | 'idle'
  | 'preflight'
  | 'stopping'
  | 'waiting_for_usb'
  | 'entering_iap'
  | 'bootloader_handshake'
  | 'erasing'
  | 'writing'
  | 'verifying'
  | 'rebooting'
  | 'validating_app'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface FirmwareUpdateSnapshot {
  id?: string
  state: FirmwareUpdateState
  artifactName?: string
  progress: number
  bytesWritten: number
  totalBytes: number
  canCancel: boolean
  message: string
  targetVersion?: string
  error?: string
  startedAt?: string
  completedAt?: string
}

export type FirmwareUpdateEvent = { type: 'snapshot' | 'progress' | 'completed' | 'failed' | 'cancelled'; snapshot: FirmwareUpdateSnapshot }

export interface FirmwarePackageManifest {
  magic: 'RDSF'
  formatVersion: 1
  board: string
  chip: string
  hardwareVersion: string
  firmwareVersion: string
  protocolVersion: string
  appStart: number
  imageLength: number
  imageCrc32: number
  imageSha256: string
  buildId: string
}

export interface FirmwarePackageInspection {
  valid: boolean
  manifest: FirmwarePackageManifest
  errors: string[]
  warnings: string[]
}

export type RecoveryState = 'idle' | 'preflight' | 'erasing' | 'writing_bootloader' | 'writing_app' | 'verifying' | 'resetting' | 'completed' | 'failed' | 'cancelled'

export interface RecoverySnapshot {
  state: RecoveryState
  progress: number
  message: string
  imageName?: string
  canCancel: boolean
  error?: string
  startedAt?: string
  completedAt?: string
}

export type RecoveryEvent = { type: 'snapshot' | 'progress' | 'completed' | 'failed' | 'cancelled'; snapshot: RecoverySnapshot }

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
  getDeviceConnection(): Promise<DeviceConnectionSnapshot>
  setDemoUsbConnected(connected: boolean): Promise<DeviceConnectionSnapshot>
  getFirmwareUpdate(): Promise<FirmwareUpdateSnapshot>
  startFirmwareUpdate(): Promise<FirmwareUpdateSnapshot>
  cancelFirmwareUpdate(): Promise<FirmwareUpdateSnapshot>
  getRecovery(): Promise<RecoverySnapshot>
  startRecovery(): Promise<RecoverySnapshot>
  cancelRecovery(): Promise<RecoverySnapshot>
  listWorkspaces(): Promise<WorkspaceSummary[]>
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceSummary>
  getWorkspace(workspaceId: string): Promise<WorkspaceSummary>
  getWorkspaceHistory(workspaceId: string, limit?: number): Promise<WorkspaceHistoryEntry[]>
  createCandidate(workspaceId: string): Promise<CandidateSnapshot>
  getCandidate(candidateId: string): Promise<CandidateSnapshot>
  getCandidateDiff(candidateId: string): Promise<CandidateDiff>
  validateCandidate(candidateId: string): Promise<CandidateSnapshot>
  rejectCandidate(candidateId: string): Promise<CandidateSnapshot>
  onStatus(listener: (status: RobotStatus) => void): () => void
  onLog(listener: (entry: LogEntry) => void): () => void
  onCcd(listener: (frame: CcdFrame) => void): () => void
  onFirmwareBuild(listener: (event: FirmwareBuildEvent) => void): () => void
  onDeviceConnection(listener: (snapshot: DeviceConnectionSnapshot) => void): () => void
  onFirmwareUpdate(listener: (event: FirmwareUpdateEvent) => void): () => void
  onRecovery(listener: (event: RecoveryEvent) => void): () => void
  onWorkspaceChanged(listener: (workspace: WorkspaceSummary) => void): () => void
  onCandidateChanged(listener: (candidate: CandidateSnapshot) => void): () => void
}
