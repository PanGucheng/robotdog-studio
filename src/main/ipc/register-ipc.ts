import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/channels'
import type { AppHealth } from '../../shared/types'
import { MockRobotService } from '../services/mock-robot-service'

export function registerIpc(robot: MockRobotService): () => void {
  const sendToAll = (channel: string, payload: unknown): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload)
    }
  }

  const statusListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotStatusEvent, payload)
  const logListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotLogEvent, payload)
  const ccdListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotCcdEvent, payload)

  robot.on('status', statusListener)
  robot.on('log', logListener)
  robot.on('ccd', ccdListener)

  ipcMain.handle(IPC_CHANNELS.healthGet, (): AppHealth => ({
    appVersion: '0.1.0',
    platform: process.platform,
    mode: 'simulation',
    checks: [
      { id: 'serial', label: '串口服务', status: 'ready', detail: '模拟设备可用' },
      { id: 'gcc', label: '沁恒 GCC', status: 'pending', detail: '等待提供本机路径' },
      { id: 'openocd', label: '沁恒 OpenOCD', status: 'pending', detail: '等待提供本机路径' },
      { id: 'reasonix', label: 'Reasonix', status: 'pending', detail: '将在 AI 阶段接入 ACP' }
    ]
  }))
  ipcMain.handle(IPC_CHANNELS.robotStatusGet, () => robot.getStatus())
  ipcMain.handle(IPC_CHANNELS.robotConnectDemo, () => robot.connectDemo())
  ipcMain.handle(IPC_CHANNELS.robotDisconnect, () => robot.disconnect())
  ipcMain.handle(IPC_CHANNELS.robotActionRun, (_event, action: unknown) => robot.runAction(action))
  ipcMain.handle(IPC_CHANNELS.robotCcdCapture, () => robot.captureCcd())

  return () => {
    robot.off('status', statusListener)
    robot.off('log', logListener)
    robot.off('ccd', ccdListener)
    for (const channel of Object.values(IPC_CHANNELS)) {
      ipcMain.removeHandler(channel)
    }
  }
}
