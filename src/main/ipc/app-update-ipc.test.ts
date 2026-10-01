import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/channels'
import { AppUpdateService } from '../services/app-update-service'

const mock = vi.hoisted(() => ({ windows: [] as unknown[], handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => mock.windows }, ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => mock.handlers.set(channel, handler) } }))
import { prepareWindowsForAppInstall, registerAppUpdateIpc } from './app-update-ipc'

class TestWindow extends EventEmitter {
  webContents = { id: 1, send: vi.fn() }
  isDestroyed(): boolean { return false }
}
describe('installation save IPC coordination', () => {
  let window: TestWindow
  beforeEach(() => {
    window = new TestWindow(); mock.windows = [window]; mock.handlers.clear()
    registerAppUpdateIpc(new AppUpdateService({ enabled: false, editionId: 'mcu-foundations', currentVersion: '1.1.0', updatesRoot: 'unused' }))
  })
  afterEach(() => vi.useRealTimers())
  const acknowledge = (senderId: number, id: string, error?: string): boolean => mock.handlers.get(IPC_CHANNELS.appUpdatePrepared)!({ sender: { id: senderId } }, id, error)
  it('accepts only the originating window and exact request, then waits for successful save', async () => {
    const task = prepareWindowsForAppInstall()
    const id = window.webContents.send.mock.calls[0][1]
    expect(acknowledge(2, id)).toBe(false)
    expect(acknowledge(1, 'stale')).toBe(false)
    expect(acknowledge(1, id)).toBe(true)
    await task
    expect(acknowledge(1, id)).toBe(false)
  })
  it('rejects reported save failures and cleans pending requests in other windows', async () => {
    const other = new TestWindow(); other.webContents.id = 2; mock.windows.push(other)
    const task = prepareWindowsForAppInstall()
    const result = expect(task).rejects.toThrow('DISK_FULL')
    acknowledge(1, window.webContents.send.mock.calls[0][1], 'DISK_FULL')
    await result
    expect(acknowledge(2, other.webContents.send.mock.calls[0][1])).toBe(false)
  })
  it('fails closed when a window closes or is unavailable', async () => {
    const task = prepareWindowsForAppInstall()
    const result = expect(task).rejects.toThrow('UPDATE_WINDOW_CLOSED')
    window.emit('closed'); await result
    mock.windows = []
    await expect(prepareWindowsForAppInstall()).rejects.toThrow('UPDATE_RENDERER_UNAVAILABLE')
  })
  it('times out instead of treating a silent renderer as saved', async () => {
    vi.useFakeTimers()
    const task = prepareWindowsForAppInstall()
    const result = expect(task).rejects.toThrow('UPDATE_SAVE_TIMEOUT')
    await vi.advanceTimersByTimeAsync(15_000)
    await result
  })
})
