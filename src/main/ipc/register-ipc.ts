import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/channels'
import type { AppHealth } from '../../shared/types'
import { FirmwareBuildService } from '../services/firmware-build-service'
import { MockRobotService } from '../services/mock-robot-service'
import { MockConnectivityService } from '../services/mock-connectivity-service'
import { MockRecoveryService } from '../services/mock-recovery-service'
import { ToolchainService } from '../services/toolchain-service'
import { WorkspaceService } from '../services/workspace-service'
import { CandidateService } from '../services/candidate-service'

export function registerIpc(robot: MockRobotService, toolchain = new ToolchainService(), firmware = new FirmwareBuildService(toolchain), workspaces?: WorkspaceService, candidates?: CandidateService): () => void {
  const connectivity = new MockConnectivityService(robot)
  const recovery = new MockRecoveryService(robot)
  const sendToAll = (channel: string, payload: unknown): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload)
    }
  }

  const statusListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotStatusEvent, payload)
  const logListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotLogEvent, payload)
  const ccdListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotCcdEvent, payload)
  const buildListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.firmwareBuildEvent, payload)
  const connectionListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.deviceConnectionEvent, payload)
  const updateListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.firmwareUpdateEvent, payload)
  const recoveryListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.recoveryEvent, payload)

  robot.on('status', statusListener)
  robot.on('log', logListener)
  robot.on('ccd', ccdListener)
  firmware.on('event', buildListener)
  connectivity.on('connection', connectionListener)
  connectivity.on('update', updateListener)
  recovery.on('event', recoveryListener)

  ipcMain.handle(IPC_CHANNELS.healthGet, async (): Promise<AppHealth> => {
    const toolchainStatus = await toolchain.getStatus()
    return {
      appVersion: '0.1.0',
      platform: process.platform,
      mode: 'simulation',
      checks: [
        { id: 'serial', label: '串口服务', status: 'ready', detail: '模拟设备可用' },
        { id: 'gcc', label: '内置 WCH GCC12', status: toolchainStatus.gcc.ok ? 'ready' : 'unavailable', detail: toolchainStatus.gcc.detail },
        { id: 'openocd', label: '内置 WCH OpenOCD', status: toolchainStatus.openocd.ok ? 'ready' : 'unavailable', detail: toolchainStatus.openocd.detail },
        { id: 'reasonix', label: 'Reasonix', status: 'pending', detail: '将在 AI 阶段接入 ACP' }
      ]
    }
  })
  ipcMain.handle(IPC_CHANNELS.robotStatusGet, () => robot.getStatus())
  ipcMain.handle(IPC_CHANNELS.robotConnectDemo, () => robot.connectDemo())
  ipcMain.handle(IPC_CHANNELS.robotDisconnect, () => robot.disconnect())
  ipcMain.handle(IPC_CHANNELS.robotActionRun, (_event, action: unknown) => robot.runAction(action))
  ipcMain.handle(IPC_CHANNELS.robotCcdCapture, () => robot.captureCcd())
  ipcMain.handle(IPC_CHANNELS.firmwareToolchainStatus, () => toolchain.getStatus())
  ipcMain.handle(IPC_CHANNELS.firmwareBuildStart, () => firmware.build())
  ipcMain.handle(IPC_CHANNELS.firmwareBuildCancel, () => firmware.cancel())
  ipcMain.handle(IPC_CHANNELS.deviceConnectionGet, () => connectivity.getConnection())
  ipcMain.handle(IPC_CHANNELS.simulationUsbSet, (_event, connected: unknown) => {
    if (typeof connected !== 'boolean') throw new Error('USB 模拟状态必须是布尔值')
    return connectivity.setUsbConnected(connected)
  })
  ipcMain.handle(IPC_CHANNELS.firmwareUpdateGet, () => connectivity.getUpdate())
  ipcMain.handle(IPC_CHANNELS.firmwareUpdateStart, () => {
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(recovery.getSnapshot().state)) throw new Error('教师恢复进行中，不能同时下载学生固件')
    const build = firmware.getSnapshot()
    if (build.state !== 'completed') throw new Error('请先完成固件编译')
    const binary = build.artifacts.find((artifact) => artifact.kind === 'bin')
    if (!binary) throw new Error('编译产物中没有 BIN 固件')
    return connectivity.startUpdate(binary)
  })
  ipcMain.handle(IPC_CHANNELS.firmwareUpdateCancel, () => connectivity.cancelUpdate())
  ipcMain.handle(IPC_CHANNELS.recoveryGet, () => recovery.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.recoveryStart, () => {
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(connectivity.getUpdate().state)) throw new Error('学生固件下载进行中，不能同时执行教师恢复')
    return recovery.start()
  })
  ipcMain.handle(IPC_CHANNELS.recoveryCancel, () => recovery.cancel())
  if (workspaces) {
    ipcMain.handle(IPC_CHANNELS.workspaceList, () => workspaces.list())
    ipcMain.handle(IPC_CHANNELS.workspaceCreate, async (_event, input: unknown) => {
      const workspace = await workspaces.create(input as never)
      sendToAll(IPC_CHANNELS.workspaceChangedEvent, workspace)
      return workspace
    })
    ipcMain.handle(IPC_CHANNELS.workspaceGet, (_event, workspaceId: unknown) => {
      if (typeof workspaceId !== 'string') throw new Error('WORKSPACE_ID_INVALID')
      return workspaces.get(workspaceId)
    })
    ipcMain.handle(IPC_CHANNELS.workspaceHistory, (_event, workspaceId: unknown, limit: unknown) => {
      if (typeof workspaceId !== 'string') throw new Error('WORKSPACE_ID_INVALID')
      if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit))) throw new Error('WORKSPACE_HISTORY_LIMIT_INVALID')
      return workspaces.history(workspaceId, limit as number | undefined)
    })
  }
  if (candidates) {
    const withCandidateEvent = async (operation: () => Promise<unknown>): Promise<unknown> => {
      const candidate = await operation()
      sendToAll(IPC_CHANNELS.candidateChangedEvent, candidate)
      return candidate
    }
    ipcMain.handle(IPC_CHANNELS.candidateCreate, (_event, workspaceId: unknown) => {
      if (typeof workspaceId !== 'string') throw new Error('WORKSPACE_ID_INVALID')
      return withCandidateEvent(() => candidates.create(workspaceId))
    })
    ipcMain.handle(IPC_CHANNELS.candidateGet, (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      return candidates.get(candidateId)
    })
    ipcMain.handle(IPC_CHANNELS.candidateGetDiff, (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      return candidates.getDiff(candidateId)
    })
    ipcMain.handle(IPC_CHANNELS.candidateValidate, (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      return withCandidateEvent(() => candidates.validate(candidateId))
    })
    ipcMain.handle(IPC_CHANNELS.candidateReject, (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      return withCandidateEvent(() => candidates.reject(candidateId))
    })
  }

  return () => {
    robot.off('status', statusListener)
    robot.off('log', logListener)
    robot.off('ccd', ccdListener)
    firmware.off('event', buildListener)
    connectivity.off('connection', connectionListener)
    connectivity.off('update', updateListener)
    recovery.off('event', recoveryListener)
    for (const channel of Object.values(IPC_CHANNELS)) {
      ipcMain.removeHandler(channel)
    }
  }
}
