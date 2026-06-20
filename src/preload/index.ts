import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/channels'
import type { AgentEvent, CandidateSnapshot, CcdFrame, DeviceConnectionSnapshot, FirmwareBuildEvent, FirmwareUpdateEvent, LogEntry, RecoveryEvent, RobotDogApi, RobotStatus, WorkspaceSummary } from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api: RobotDogApi = {
  getHealth: () => ipcRenderer.invoke(IPC_CHANNELS.healthGet),
  getRuntimeInfo: () => ipcRenderer.invoke(IPC_CHANNELS.runtimeInfoGet),
  exportDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsExport),
  openDataDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.dataDirectoryOpen),
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.robotStatusGet),
  connectDemo: () => ipcRenderer.invoke(IPC_CHANNELS.robotConnectDemo),
  disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.robotDisconnect),
  runAction: (action) => ipcRenderer.invoke(IPC_CHANNELS.robotActionRun, action),
  captureCcd: () => ipcRenderer.invoke(IPC_CHANNELS.robotCcdCapture),
  getToolchainStatus: () => ipcRenderer.invoke(IPC_CHANNELS.firmwareToolchainStatus),
  getFirmwareBaselineStatus: () => ipcRenderer.invoke(IPC_CHANNELS.firmwareBaselineStatus),
  startFirmwareBuild: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.firmwareBuildStart, workspaceId),
  cancelFirmwareBuild: () => ipcRenderer.invoke(IPC_CHANNELS.firmwareBuildCancel),
  getDeviceConnection: () => ipcRenderer.invoke(IPC_CHANNELS.deviceConnectionGet),
  setDemoUsbConnected: (connected) => ipcRenderer.invoke(IPC_CHANNELS.simulationUsbSet, connected),
  getFirmwareUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.firmwareUpdateGet),
  startFirmwareUpdate: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.firmwareUpdateStart, workspaceId),
  cancelFirmwareUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.firmwareUpdateCancel),
  getRecovery: () => ipcRenderer.invoke(IPC_CHANNELS.recoveryGet),
  startRecovery: () => ipcRenderer.invoke(IPC_CHANNELS.recoveryStart),
  cancelRecovery: () => ipcRenderer.invoke(IPC_CHANNELS.recoveryCancel),
  listWorkspaces: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceList),
  createWorkspace: (input) => ipcRenderer.invoke(IPC_CHANNELS.workspaceCreate, input),
  renameWorkspace: (workspaceId, name) => ipcRenderer.invoke(IPC_CHANNELS.workspaceRename, workspaceId, name),
  getWorkspace: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.workspaceGet, workspaceId),
  getWorkspaceHistory: (workspaceId, limit) => ipcRenderer.invoke(IPC_CHANNELS.workspaceHistory, workspaceId, limit),
  undoWorkspace: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.workspaceUndo, workspaceId),
  listStudentCodeFiles: (workspaceId, candidateId) => ipcRenderer.invoke(IPC_CHANNELS.studentFilesList, workspaceId, candidateId),
  openManualDraft: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.manualDraftOpen, workspaceId),
  writeManualDraft: (candidateId, path, content) => ipcRenderer.invoke(IPC_CHANNELS.manualDraftWrite, candidateId, path, content),
  explainStudentCode: (workspaceId, request) => ipcRenderer.invoke(IPC_CHANNELS.manualDraftExplain, workspaceId, request),
  createCandidate: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.candidateCreate, workspaceId),
  getCandidate: (candidateId) => ipcRenderer.invoke(IPC_CHANNELS.candidateGet, candidateId),
  getCandidateDiff: (candidateId) => ipcRenderer.invoke(IPC_CHANNELS.candidateGetDiff, candidateId),
  validateCandidate: (candidateId) => ipcRenderer.invoke(IPC_CHANNELS.candidateValidate, candidateId),
  buildCandidate: (candidateId) => ipcRenderer.invoke(IPC_CHANNELS.candidateBuild, candidateId),
  applyCandidate: (candidateId) => ipcRenderer.invoke(IPC_CHANNELS.candidateApply, candidateId),
  rejectCandidate: (candidateId) => ipcRenderer.invoke(IPC_CHANNELS.candidateReject, candidateId),
  promptAgent: (workspaceId, message) => ipcRenderer.invoke(IPC_CHANNELS.agentPrompt, workspaceId, message),
  cancelAgent: (turnId) => ipcRenderer.invoke(IPC_CHANNELS.agentCancel, turnId),
  respondAgentPermission: (turnId, requestId, optionId) => ipcRenderer.invoke(IPC_CHANNELS.agentPermissionRespond, turnId, requestId, optionId),
  listAgentHistory: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.agentHistoryList, workspaceId),
  getAgentRuntimeStatus: () => ipcRenderer.invoke(IPC_CHANNELS.agentRuntimeStatus),
  setAgentApiKey: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS.agentApiKeySet, apiKey),
  clearAgentApiKey: () => ipcRenderer.invoke(IPC_CHANNELS.agentApiKeyClear),
  onStatus: (listener) => subscribe<RobotStatus>(IPC_CHANNELS.robotStatusEvent, listener),
  onLog: (listener) => subscribe<LogEntry>(IPC_CHANNELS.robotLogEvent, listener),
  onCcd: (listener) => subscribe<CcdFrame>(IPC_CHANNELS.robotCcdEvent, listener),
  onFirmwareBuild: (listener) => subscribe<FirmwareBuildEvent>(IPC_CHANNELS.firmwareBuildEvent, listener),
  onDeviceConnection: (listener) => subscribe<DeviceConnectionSnapshot>(IPC_CHANNELS.deviceConnectionEvent, listener),
  onFirmwareUpdate: (listener) => subscribe<FirmwareUpdateEvent>(IPC_CHANNELS.firmwareUpdateEvent, listener),
  onRecovery: (listener) => subscribe<RecoveryEvent>(IPC_CHANNELS.recoveryEvent, listener),
  onWorkspaceChanged: (listener) => subscribe<WorkspaceSummary>(IPC_CHANNELS.workspaceChangedEvent, listener),
  onCandidateChanged: (listener) => subscribe<CandidateSnapshot>(IPC_CHANNELS.candidateChangedEvent, listener),
  onAgentEvent: (listener) => subscribe<AgentEvent>(IPC_CHANNELS.agentEvent, listener)
}

contextBridge.exposeInMainWorld('robotDog', api)
