import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/channels'
import type { CcdFrame, FirmwareBuildEvent, LogEntry, RobotDogApi, RobotStatus } from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api: RobotDogApi = {
  getHealth: () => ipcRenderer.invoke(IPC_CHANNELS.healthGet),
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.robotStatusGet),
  connectDemo: () => ipcRenderer.invoke(IPC_CHANNELS.robotConnectDemo),
  disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.robotDisconnect),
  runAction: (action) => ipcRenderer.invoke(IPC_CHANNELS.robotActionRun, action),
  captureCcd: () => ipcRenderer.invoke(IPC_CHANNELS.robotCcdCapture),
  getToolchainStatus: () => ipcRenderer.invoke(IPC_CHANNELS.firmwareToolchainStatus),
  startFirmwareBuild: () => ipcRenderer.invoke(IPC_CHANNELS.firmwareBuildStart),
  cancelFirmwareBuild: () => ipcRenderer.invoke(IPC_CHANNELS.firmwareBuildCancel),
  onStatus: (listener) => subscribe<RobotStatus>(IPC_CHANNELS.robotStatusEvent, listener),
  onLog: (listener) => subscribe<LogEntry>(IPC_CHANNELS.robotLogEvent, listener),
  onCcd: (listener) => subscribe<CcdFrame>(IPC_CHANNELS.robotCcdEvent, listener),
  onFirmwareBuild: (listener) => subscribe<FirmwareBuildEvent>(IPC_CHANNELS.firmwareBuildEvent, listener)
}

contextBridge.exposeInMainWorld('robotDog', api)
