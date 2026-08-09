import type { AppEditionProfile, EditionId } from './edition'

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

export interface AppRuntimeInfo {
  dataRoot: string
  diagnosticsRoot: string
  mode: 'simulation' | 'hardware'
  workspaceCount: number
  workspaceTemplate?: { root: string; exists: boolean }
  wchLinkDriver?: WchLinkDriverInstallStatus
  toolchain: ToolchainStatus
  baseline: FirmwareBaselineStatus
  agent: AgentRuntimeStatus
}

export interface WchLinkDriverInstallStatus {
  enabled: boolean
  attempted: boolean
  ok: boolean
  driverRoot: string
  infPath?: string
  exitCode?: number | string
  detail: string
  attemptedAt?: string
}

export interface DiagnosticExportResult {
  path: string
  createdAt: string
  bytes: number
  included: string[]
  excluded: string[]
}

export type WorkspaceState = 'ready' | 'candidate_active' | 'applying' | 'error' | 'conflict' | 'archived'

export interface CreateWorkspaceInput {
  name?: string
  studentDisplayName: string
}

export interface CreateLessonAttemptInput {
  courseId: string
  lessonId: string
  studentDisplayName: string
}

export type WorkspacePurpose = 'fun-project' | 'mcu-sandbox' | 'mcu-lesson-attempt'

export interface WorkspaceCourseBinding {
  courseId: string
  lessonId: string
  contentVersion: number
  attemptNumber: number
}

export interface WorkspaceMetadata {
  schemaVersion: 3
  id: string
  name: string
  studentDisplayName: string
  learningPath: EditionId
  workspacePurpose: WorkspacePurpose
  templateId: string
  templateVersion: string
  courseBinding?: WorkspaceCourseBinding
  firmwareBaselineId: string
  baselineCommit: string
  nameCustomized: boolean
  createdAt: string
  updatedAt: string
  activeBranch: 'main'
  lastCheckpoint: string
  policyProfile: 'student-v1' | 'mcu-foundations-v1'
  state: WorkspaceState
  activeCandidateId?: string
}

export interface WorkspaceSummary {
  id: string
  name: string
  studentDisplayName: string
  learningPath: EditionId
  workspacePurpose: WorkspacePurpose
  templateId: string
  templateVersion: string
  courseBinding?: WorkspaceCourseBinding
  firmwareBaselineId: string
  baselineCommit: string
  createdAt: string
  headCommit: string
  state: WorkspaceState
  updatedAt: string
  activeCandidateId?: string
}

export type CoursePublicationStatus = 'draft' | 'published'
export type CourseHardwareRequirement = 'none' | 'optional' | 'required'
export type CourseVerificationStatus = 'not-required' | 'pending-hardware-check' | 'hardware-checked'

export interface CourseLessonSummary {
  courseId: string
  contentVersion: number
  progressCompatibleFrom: number[]
  lessonId: string
  title: string
  summary: string
  estimatedMinutes: number
  hardware: CourseHardwareRequirement
  verification: CourseVerificationStatus
  status: CoursePublicationStatus
  prerequisites: string[]
  order: number
}

export interface CourseSummary {
  courseId: string
  contentVersion: number
  title: string
  summary: string
  audience: string
  status: CoursePublicationStatus
  boardScope: string
  lessonCount: number
}

export interface CourseDetail extends CourseSummary {
  objectives: string[]
  sourceAttribution: string[]
  lessons: CourseLessonSummary[]
}

export interface CourseLesson extends CourseLessonSummary {
  objectives: string[]
  expectedObservation: string
  templateId: string
  editableGlobs: string[]
  readableFiles: string[]
  deniedGlobs: string[]
  steps: Array<{ stepId: string; type: string; title: string; instruction: string; questionId?: string; fileTarget?: { path: string; line?: number }; lectureSectionId?: string }>
  completionChecks: Array<{ type: string; target?: string }>
  reflectionQuestions: Array<{ questionId: string; prompt: string }>
  aiContext: { teachingFocus: string; hints: string[] }
}

export type CourseAttemptState = 'not-started' | 'in-progress' | 'needs-attention' | 'completed'
export type CourseOperationKind = 'candidate-build' | 'firmware-build' | 'flash'
export type CourseOperationState = 'not-run' | 'passed' | 'failed' | 'stale'

export interface CourseOperationProgress {
  state: CourseOperationState
  checkedAt?: string
  detail?: string
}

export interface CourseStepProgress {
  stepId: string
  completed: boolean
  completedAt?: string
}

export interface CourseCompletionCheckResult {
  type: CourseLesson['completionChecks'][number]['type']
  target?: string
  passed: boolean
  label: string
}

export interface CourseProgressSnapshot {
  schemaVersion: 1
  workspaceId: string
  courseId: string
  lessonId: string
  contentVersion: number
  steps: CourseStepProgress[]
  answers: Record<string, string>
  observations: Record<string, string>
  appliedFiles: string[]
  operations: Record<CourseOperationKind, CourseOperationProgress>
  checks: CourseCompletionCheckResult[]
  completedSteps: number
  totalSteps: number
  completionPercent: number
  state: CourseAttemptState
  createdAt: string
  updatedAt: string
  completedAt?: string
  recoveredFromCorruption?: boolean
}

export type CourseProgressUpdate =
  | { kind: 'step'; stepId: string; completed: boolean }
  | { kind: 'answer'; questionId: string; answer: string }
  | { kind: 'observation'; stepId: string; observation: string }
  | { kind: 'lecture-read'; stepId: string; sectionId: string; lectureContentVersion: number; completed: boolean }

export type CourseLectureStatus = 'ready' | 'missing' | 'invalid'
export type CourseLectureCalloutKind = 'concept' | 'note' | 'tip' | 'pitfall' | 'safety'

export interface CourseLectureTextNode {
  textNodeId: string
  text: string
}

export type CourseLectureInline =
  | { type: 'text'; textNodeId: string; text: string }
  | { type: 'strong' | 'emphasis' | 'strikethrough'; children: CourseLectureInline[] }
  | { type: 'inline-code' | 'inline-math'; textNodeId: string; value: string }
  | { type: 'section-link'; sectionId: string; children: CourseLectureInline[] }
  | { type: 'external-link'; url: string; children: CourseLectureInline[] }
  | { type: 'asset-image'; assetId: string; alt: string; title?: string }
  | { type: 'line-break' }

export type CourseLectureBlock =
  | { type: 'heading'; depth: 1 | 2 | 3 | 4 | 5 | 6; sectionId?: string; children: CourseLectureInline[] }
  | { type: 'paragraph'; children: CourseLectureInline[] }
  | { type: 'list'; ordered: boolean; start?: number; items: CourseLectureBlock[][] }
  | { type: 'blockquote'; children: CourseLectureBlock[] }
  | { type: 'code'; textNodeId: string; language?: string; value: string }
  | { type: 'math'; textNodeId: string; value: string }
  | { type: 'table'; align: Array<'left' | 'right' | 'center' | undefined>; rows: CourseLectureInline[][][] }
  | { type: 'thematic-break' }
  | { type: 'callout'; kind: CourseLectureCalloutKind; title?: string; children: CourseLectureBlock[] }
  | { type: 'code-target'; label: string; path: string; line?: number }
  | { type: 'task-link'; label: string; stepId: string }

export interface CourseLectureSection {
  sectionId: string
  title: string
  level: 2 | 3
  order: number
  blocks: CourseLectureBlock[]
  canonicalText: string
  textNodes: CourseLectureTextNode[]
}

export interface CourseLectureAssetReference {
  assetId: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/svg+xml'
}

export interface CourseLectureDocument {
  courseId: string
  lessonId: string
  contentVersion: number
  documentDigest: string
  sections: CourseLectureSection[]
  assets: CourseLectureAssetReference[]
  codeTargetIndex: Record<string, string[]>
  taskLinkIndex: Record<string, string[]>
}

export type CourseLectureResult =
  | { status: 'ready'; document: CourseLectureDocument }
  | { status: 'missing' }
  | { status: 'invalid'; errorCode: string; line?: number; column?: number }

export interface CourseLectureAsset {
  assetId: string
  mimeType: CourseLectureAssetReference['mimeType']
  dataBase64: string
}

export interface CourseLectureSelectionRange {
  documentDigest: string
  sectionId: string
  start: { textNodeId: string; offset: number }
  end: { textNodeId: string; offset: number }
}

export interface StudentLectureQuestionRequest {
  selection: CourseLectureSelectionRange
  question: string
}

export interface FirmwareLegacyBaselineManifest {
  schemaVersion: 1
  id: string
  label: string
  status: 'provisional' | 'release'
  releaseEligible: boolean
  replacementPolicy: string
  source: { repository: string; expectedCommit: string; developmentDefaultRoot: string }
  target: { board: string; chip: string; startup: string; linkerScript: string; memory: { flashBytes: number; ramBytes: number; confirmed: boolean } }
  toolchain: { profile: string; arch: string; abi: string; codeModel: string }
  build: { includeDirectories: string[]; sources: string[]; cFlags: string[]; assemblerFlags: string[]; linkFlags: string[] }
  studentOverlay: { source: string; header: string; configInput: string; generatedHeader: string }
  artifacts: { elf: string; hex: string; bin: string; map: string }
  integrity: Array<{ path: string; sha256: string }>
}

export interface FirmwareLiveBaselineManifest {
  schemaVersion: 2
  id: string
  label: string
  status: 'provisional' | 'release'
  releaseEligible: boolean
  replacementPolicy: string
  source: { repository: string; expectedCommit: string; developmentDefaultRoot: string }
  target: { board: string; chip: string; startup: string; linkerScript: string; memory: { flashBytes: number; ramBytes: number; confirmed: boolean } }
  toolchain: { profile: string; arch: string; abi: string; codeModel: string }
  build: { type: 'cmake'; preset: string; outputDir: string; toolchain: string }
  studentOverlay: { source: string; header: string; configInput: string; generatedHeader: string }
  artifacts: { elf: string; hex: string; bin: string; map: string; size: string; hashes: string; sourceInput: string }
  integrity: Array<{ path: string; sha256: string }>
  live: { activeCommit: string; shortCommit: string; manifestPath: string; verificationReport?: string; flashFreeBytes?: number; ramUsedBytes?: number }
}

export type FirmwareBaselineManifest = FirmwareLegacyBaselineManifest | FirmwareLiveBaselineManifest

export interface FirmwareBaselineStatus {
  id: string
  label: string
  sourceRoot: string
  expectedCommit: string
  status: 'provisional' | 'release'
  readyForTesting: boolean
  releaseEligible: boolean
  verifiedFiles: string[]
  errors: string[]
  warnings: string[]
  memory: { flashBytes: number; ramBytes: number; confirmed: boolean }
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
  origin?: 'ai' | 'manual'
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
  buildProof?: CandidateBuildProof
  appliedCommit?: string
  error?: string
  diagnostics?: CandidateDiagnostic[]
}

export interface CandidateDiagnostic {
  path?: string
  line?: number
  column?: number
  severity: 'error' | 'warning'
  message: string
}

export interface StudentCodeFile {
  path: string
  label: string
  group: string
  language: 'c' | 'yaml' | 'markdown'
  editable: boolean
  content: string
}

export type ProjectExplorerLanguage = 'c' | 'cpp' | 'asm' | 'linker' | 'cmake' | 'json' | 'yaml' | 'markdown' | 'text'
export type ProjectExplorerOrigin = 'lesson-overlay' | 'firmware-baseline'
export type ProjectExplorerRole = 'student-code' | 'course-adapter' | 'application' | 'core' | 'peripheral' | 'startup' | 'linker' | 'build' | 'config' | 'documentation'

export interface ProjectExplorerNode {
  id: string
  parentId?: string
  name: string
  kind: 'directory' | 'file'
  language?: ProjectExplorerLanguage
  origin: ProjectExplorerOrigin
  role: ProjectExplorerRole
  access: 'editable' | 'read-only'
  state: 'normal' | 'modified' | 'error' | 'warning'
  displayPath: string
}

export interface ProjectExplorerSnapshot {
  workspaceId: string
  candidateId?: string
  rootLabel: string
  baselineId: string
  baselineCommit: string
  baselineAvailable: boolean
  warning?: string
  nodes: ProjectExplorerNode[]
}

export interface ProjectExplorerFile {
  node: ProjectExplorerNode
  content: string
}

export interface StudentCodeExplanationRequest {
  kind: 'selection' | 'diagnostic'
  candidateId?: string
  selectedPath?: string
  content: string
}

export interface StudentDiagnosticHelp {
  candidateId: string
  state: 'loading' | 'ready' | 'failed'
  text?: string
}

export interface CandidateBuildProof {
  candidateId: string
  sourceTreeHash: string
  diffHash: string
  compiler: string
  objectSha256: string
  completedAt: string
  checks: Array<{ id: string; label: string; detail: string }>
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

export type AgentTurnState = 'preparing' | 'thinking' | 'editing' | 'validating' | 'review_ready' | 'no_changes' | 'cancelled' | 'failed'

export interface AgentTurnSnapshot {
  turnId: string
  workspaceId: string
  candidateId?: string
  state: AgentTurnState
  message: string
  promptVersion?: string
  promptHash?: string
  startedAt: string
}

export interface AgentRuntimeStatus {
  adapter: 'mock' | 'reasonix'
  version: string
  installed: boolean
  apiKeyConfigured: boolean
  ready: boolean
  detail: string
}

export interface StudentPlanStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'completed'
}

interface AgentEventBase {
  eventId: string
  turnId: string
  sequence: number
  timestamp: string
}

export type AgentEvent =
  | AgentEventBase & { type: 'turn_started'; workspaceId: string; candidateId?: string; message: string; promptVersion?: string; promptHash?: string }
  | AgentEventBase & { type: 'plan'; steps: StudentPlanStep[] }
  | AgentEventBase & { type: 'assistant_delta'; text: string }
  | AgentEventBase & { type: 'activity'; label: string; state: 'thinking' | 'editing' | 'validating' }
  | AgentEventBase & { type: 'permission_request'; requestId: string; title: string; kind: 'edit' | 'question'; detail: string; options: Array<{ id: string; label: string; tone: 'approve' | 'reject' | 'neutral' }> }
  | AgentEventBase & { type: 'permission_resolved'; requestId: string; optionId: string }
  | AgentEventBase & { type: 'candidate_ready'; candidate: CandidateSnapshot; summary: string }
  | AgentEventBase & { type: 'completed'; state: 'review_ready' | 'no_changes'; message: string }
  | AgentEventBase & { type: 'cancelled'; message: string }
  | AgentEventBase & { type: 'failed'; code: string; message: string }

type WithoutAgentEnvelope<T> = T extends AgentEvent ? Omit<T, keyof AgentEventBase> : never
export type AgentEventPayload = WithoutAgentEnvelope<AgentEvent>

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
  sha256?: string
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
  workspaceId?: string
  firmwareRoot: string
  outputDir?: string
  currentFile?: string
  completedFiles: number
  totalFiles: number
  logs: string[]
  artifacts: FirmwareBuildArtifact[]
  size?: FirmwareSizeInfo
  proof?: FirmwareBuildProof
  error?: string
  startedAt?: string
  completedAt?: string
}

export interface FirmwareBuildProof {
  schemaVersion: 1
  inputHash: string
  workspaceId: string
  workspaceCommit: string
  workspaceSourceHash: string
  firmwareBaselineId: string
  baselineCommit: string
  baselineSourceHash: string
  toolchain: string
  board: string
  size: FirmwareSizeInfo
  artifacts: Array<{ name: string; kind: FirmwareBuildArtifact['kind']; bytes: number; sha256: string }>
  startedAt: string
  completedAt: string
  releaseEligible: boolean
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

export type WchLinkFlashState =
  | 'idle'
  | 'probing'
  | 'target_ready'
  | 'artifact_missing'
  | 'flashing'
  | 'verifying'
  | 'resetting'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface WchLinkProbeInfo {
  openocdVersion?: string
  adapterName?: string
  adapterMode?: string
  adapterVersion?: string
  targetExamined: boolean
  xlen?: number
  misa?: string
  flashBanks: Array<{ name: string; driver: string; base: string; size: string }>
}

export interface WchLinkFlashArtifact {
  name: string
  kind: FirmwareBuildArtifact['kind']
  bytes?: number
  sha256?: string
  workspaceId?: string
  workspaceCommit?: string
  firmwareBaselineId?: string
  stale: boolean
}

export interface WchLinkFlashSnapshot {
  state: WchLinkFlashState
  progress: number
  message: string
  canCancel: boolean
  probe?: WchLinkProbeInfo
  artifact?: WchLinkFlashArtifact
  logs: string[]
  error?: string
  startedAt?: string
  completedAt?: string
}

export type WchLinkFlashEvent = { type: 'snapshot' | 'progress' | 'completed' | 'failed' | 'cancelled'; snapshot: WchLinkFlashSnapshot }

export interface RobotDogApi {
  getEditionProfile(): Promise<AppEditionProfile>
  getHealth(): Promise<AppHealth>
  getRuntimeInfo(): Promise<AppRuntimeInfo>
  exportDiagnostics(): Promise<DiagnosticExportResult>
  openDataDirectory(): Promise<boolean>
  getStatus(): Promise<RobotStatus>
  connectDemo(): Promise<RobotStatus>
  disconnect(): Promise<RobotStatus>
  runAction(action: RobotAction): Promise<RobotStatus>
  captureCcd(): Promise<CcdFrame>
  getToolchainStatus(): Promise<ToolchainStatus>
  getFirmwareBaselineStatus(): Promise<FirmwareBaselineStatus>
  startFirmwareBuild(workspaceId: string): Promise<FirmwareBuildSnapshot>
  cancelFirmwareBuild(): Promise<FirmwareBuildSnapshot>
  getDeviceConnection(): Promise<DeviceConnectionSnapshot>
  setDemoUsbConnected(connected: boolean): Promise<DeviceConnectionSnapshot>
  getFirmwareUpdate(): Promise<FirmwareUpdateSnapshot>
  startFirmwareUpdate(workspaceId: string): Promise<FirmwareUpdateSnapshot>
  cancelFirmwareUpdate(): Promise<FirmwareUpdateSnapshot>
  getRecovery(): Promise<RecoverySnapshot>
  startRecovery(): Promise<RecoverySnapshot>
  cancelRecovery(): Promise<RecoverySnapshot>
  getWchLinkFlash(): Promise<WchLinkFlashSnapshot>
  probeWchLink(): Promise<WchLinkFlashSnapshot>
  flashWchLink(workspaceId: string): Promise<WchLinkFlashSnapshot>
  cancelWchLink(): Promise<WchLinkFlashSnapshot>
  listWorkspaces(): Promise<WorkspaceSummary[]>
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceSummary>
  renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceSummary>
  listStudentCodeFiles(workspaceId: string, candidateId?: string): Promise<StudentCodeFile[]>
  getProjectExplorer(workspaceId: string, candidateId?: string): Promise<ProjectExplorerSnapshot>
  readProjectExplorerFile(workspaceId: string, nodeId: string, candidateId?: string): Promise<ProjectExplorerFile>
  openManualDraft(workspaceId: string): Promise<CandidateSnapshot>
  writeManualDraft(candidateId: string, path: StudentCodeFile['path'], content: string): Promise<CandidateSnapshot>
  explainStudentCode(workspaceId: string, request: StudentCodeExplanationRequest): Promise<AgentTurnSnapshot>
  repairStudentCode(workspaceId: string, candidateId: string): Promise<AgentTurnSnapshot>
  getWorkspace(workspaceId: string): Promise<WorkspaceSummary>
  getWorkspaceHistory(workspaceId: string, limit?: number): Promise<WorkspaceHistoryEntry[]>
  undoWorkspace(workspaceId: string): Promise<WorkspaceSummary>
  listCourses(): Promise<CourseSummary[]>
  getCourse(courseId: string): Promise<CourseDetail>
  getCourseLesson(courseId: string, lessonId: string): Promise<CourseLesson>
  getCourseLecture(courseId: string, lessonId: string): Promise<CourseLectureResult>
  getCourseLectureAsset(courseId: string, lessonId: string, documentDigest: string, assetId: string): Promise<CourseLectureAsset>
  askCourseLecture(workspaceId: string, request: StudentLectureQuestionRequest): Promise<AgentTurnSnapshot>
  openExternalUrl(url: string): Promise<boolean>
  listLessonAttempts(courseId: string, lessonId: string): Promise<WorkspaceSummary[]>
  createLessonAttempt(input: CreateLessonAttemptInput): Promise<WorkspaceSummary>
  getCourseProgress(workspaceId: string): Promise<CourseProgressSnapshot>
  updateCourseProgress(workspaceId: string, update: CourseProgressUpdate): Promise<CourseProgressSnapshot>
  createCandidate(workspaceId: string): Promise<CandidateSnapshot>
  getCandidate(candidateId: string): Promise<CandidateSnapshot>
  getCandidateDiff(candidateId: string): Promise<CandidateDiff>
  validateCandidate(candidateId: string): Promise<CandidateSnapshot>
  buildCandidate(candidateId: string): Promise<CandidateSnapshot>
  applyCandidate(candidateId: string): Promise<CandidateSnapshot>
  rejectCandidate(candidateId: string): Promise<CandidateSnapshot>
  promptAgent(workspaceId: string, message: string): Promise<AgentTurnSnapshot>
  cancelAgent(turnId?: string): Promise<boolean>
  respondAgentPermission(turnId: string, requestId: string, optionId: string): Promise<boolean>
  listAgentHistory(workspaceId: string): Promise<AgentEvent[]>
  getAgentRuntimeStatus(): Promise<AgentRuntimeStatus>
  setAgentApiKey(apiKey: string): Promise<AgentRuntimeStatus>
  clearAgentApiKey(): Promise<AgentRuntimeStatus>
  onStatus(listener: (status: RobotStatus) => void): () => void
  onLog(listener: (entry: LogEntry) => void): () => void
  onCcd(listener: (frame: CcdFrame) => void): () => void
  onFirmwareBuild(listener: (event: FirmwareBuildEvent) => void): () => void
  onDeviceConnection(listener: (snapshot: DeviceConnectionSnapshot) => void): () => void
  onFirmwareUpdate(listener: (event: FirmwareUpdateEvent) => void): () => void
  onRecovery(listener: (event: RecoveryEvent) => void): () => void
  onWchLinkFlash(listener: (event: WchLinkFlashEvent) => void): () => void
  onWorkspaceChanged(listener: (workspace: WorkspaceSummary) => void): () => void
  onCandidateChanged(listener: (candidate: CandidateSnapshot) => void): () => void
  onAgentEvent(listener: (event: AgentEvent) => void): () => void
}
