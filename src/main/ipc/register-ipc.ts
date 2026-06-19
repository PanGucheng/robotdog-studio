import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/channels'
import type { AppHealth } from '../../shared/types'
import { FirmwareBuildService } from '../services/firmware-build-service'
import { MockRobotService } from '../services/mock-robot-service'
import { ToolchainService } from '../services/toolchain-service'

export function registerIpc(robot: MockRobotService, toolchain = new ToolchainService(), firmware = new FirmwareBuildService(toolchain)): () => void {
  const sendToAll = (channel: string, payload: unknown): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload)
    }
  }

  const statusListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotStatusEvent, payload)
  const logListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotLogEvent, payload)
  const ccdListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotCcdEvent, payload)
  const buildListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.firmwareBuildEvent, payload)

  robot.on('status', statusListener)
  robot.on('log', logListener)
  robot.on('ccd', ccdListener)
  firmware.on('event', buildListener)

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

  return () => {
    robot.off('status', statusListener)
    robot.off('log', logListener)
    robot.off('ccd', ccdListener)
    firmware.off('event', buildListener)
    for (const channel of Object.values(IPC_CHANNELS)) {
      ipcMain.removeHandler(channel)
    }
  }
}
