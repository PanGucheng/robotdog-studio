import { randomUUID } from 'node:crypto'
import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/channels'
import type { AppUpdateService } from '../services/app-update-service'

const pending = new Map<number, { id: string; resolve: () => void; reject: (error: Error) => void }>()

export async function prepareWindowsForAppInstall(): Promise<void> {
  const windows = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed())
  if (windows.length === 0) throw new Error('UPDATE_RENDERER_UNAVAILABLE')
  const requests = new Set<number>()
  try { await Promise.all(windows.map(window => new Promise<void>((resolve, reject) => {
    const id = randomUUID()
    const senderId = window.webContents.id
    requests.add(senderId)
    let finished = false
    const finish = (error?: Error): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      if (pending.get(senderId)?.id === id) pending.delete(senderId)
      window.removeListener('closed', closed)
      if (error) reject(error); else resolve()
    }
    const closed = (): void => finish(new Error('UPDATE_WINDOW_CLOSED'))
    const timer = setTimeout(() => finish(new Error('UPDATE_SAVE_TIMEOUT')), 15_000)
    pending.set(senderId, { id, resolve: () => finish(), reject: finish })
    window.once('closed', closed)
    window.webContents.send(IPC_CHANNELS.appUpdatePrepare, id)
  }))) } finally {
    for (const id of requests) pending.get(id)?.reject(new Error('UPDATE_PREPARATION_ABORTED'))
  }
}

export function registerAppUpdateIpc(service: AppUpdateService): void {
  ipcMain.handle(IPC_CHANNELS.appUpdateStatusGet, async () => { await service.initialize(); return service.getStatus() })
  ipcMain.handle(IPC_CHANNELS.appUpdateCheck, () => service.checkForUpdate())
  ipcMain.handle(IPC_CHANNELS.appUpdateDownload, () => service.downloadUpdate())
  ipcMain.handle(IPC_CHANNELS.appUpdateInstall, () => service.installUpdate())
  ipcMain.handle(IPC_CHANNELS.appUpdatePrepared, (event, id: unknown, error: unknown) => {
    const task = pending.get(event.sender.id)
    if (!task || typeof id !== 'string' || task.id !== id || (error !== undefined && typeof error !== 'string')) return false
    if (error !== undefined) task.reject(new Error(error)); else task.resolve()
    return true
  })
}
