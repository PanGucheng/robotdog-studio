// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateStatus } from '../../../shared/app-update'
import { EDITION_PROFILES } from '../../../shared/edition'
import { browserDemoApi } from '../lib/browser-demo-api'
import { registerPendingSave } from '../lib/pending-saves'
import { AppUpdateProvider } from './AppUpdateProvider'
import { AboutPage } from './AboutPage'
import { DisplaySettings } from './DisplaySettings'

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true
describe('shared App Update UI and save handshake', () => {
  let container: HTMLDivElement
  let root: Root
  let emit: (value: AppUpdateStatus) => void
  let prepare: (id: string) => void
  const initial: AppUpdateStatus = { kind: 'idle', editionId: 'mcu-foundations', currentVersion: '1.1.0', downloadedBytes: 0, totalBytes: 100, message: '尚未检查' }
  beforeEach(() => {
    container = document.createElement('div'); document.body.append(container); root = createRoot(container)
    window.robotDog = { ...browserDemoApi,
      getAppUpdateStatus: vi.fn(async () => initial),
      checkAppUpdate: vi.fn(async (): Promise<AppUpdateStatus> => ({ ...initial, kind: 'available', targetVersion: '1.2.0', notes: '新的功能', message: '发现新版本' })),
      downloadAppUpdate: vi.fn(async (): Promise<AppUpdateStatus> => ({ ...initial, kind: 'ready', targetVersion: '1.2.0', message: '可以安装' })),
      installAppUpdate: vi.fn(async (): Promise<AppUpdateStatus> => ({ ...initial, kind: 'ready', targetVersion: '1.2.0', message: '安装未启动' })),
      onAppUpdate: callback => { emit = callback; return () => {} },
      onAppUpdatePrepare: callback => { prepare = callback; return () => {} },
      acknowledgeAppUpdatePrepare: vi.fn(async () => true)
    }
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete (window as Partial<Window>).robotDog })
  async function render(): Promise<void> {
    await act(async () => root.render(createElement(AppUpdateProvider, null,
      createElement(AboutPage, { edition: EDITION_PROFILES['mcu-foundations'] }),
      createElement(DisplaySettings, { scale: 100, onScaleChange() {} }))))
  }
  it('shares manual checks, progress, ready state, and later dismissal across About and Settings', async () => {
    await render()
    const settingsTab = [...container.querySelectorAll<HTMLButtonElement>('.settings-nav-item')].find(button => button.textContent === '软件更新')!
    await act(async () => settingsTab.click())
    expect(container.querySelectorAll('.app-update-controls')).toHaveLength(2)
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '检查软件更新')!.click())
    expect(window.robotDog!.checkAppUpdate).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('.app-update-controls')).toHaveLength(3)
    await act(async () => emit({ ...initial, kind: 'downloading', targetVersion: '1.2.0', downloadedBytes: 50, message: '下载中' }))
    expect(container.querySelectorAll('progress')).toHaveLength(3)
    expect(container.textContent).toContain('50%')
    await act(async () => emit({ ...initial, kind: 'ready', targetVersion: '1.2.0', message: '可以安装' }))
    expect([...container.querySelectorAll('button')].filter(button => button.textContent === '立即安装')).toHaveLength(3)
    await act(async () => container.querySelector<HTMLButtonElement>('.app-update-toast > button')!.click())
    expect(container.querySelector('.app-update-toast')).toBeNull()
    expect([...container.querySelectorAll('button')].filter(button => button.textContent === '立即安装')).toHaveLength(2)
  })
  it('locks interaction and acknowledges only after pending editor writes finish', async () => {
    await render()
    let finish!: () => void
    const unregister = registerPendingSave(() => new Promise<void>(resolve => { finish = resolve }))
    try {
      await act(async () => { emit({ ...initial, kind: 'installing', message: '保存中' }); prepare('request-1') })
      expect(container.querySelector('[inert]')).not.toBeNull()
      expect(window.robotDog!.acknowledgeAppUpdatePrepare).not.toHaveBeenCalled()
      await act(async () => finish())
      expect(window.robotDog!.acknowledgeAppUpdatePrepare).toHaveBeenCalledWith('request-1')
    } finally { unregister() }
  })
  it('reports save errors to Main without acknowledging success and keeps background errors non-blocking', async () => {
    await render()
    const unregister = registerPendingSave(async () => { throw new Error('DISK_FULL') })
    try {
      await act(async () => prepare('request-2'))
      expect(window.robotDog!.acknowledgeAppUpdatePrepare).toHaveBeenCalledWith('request-2', 'DISK_FULL')
      await act(async () => emit({ ...initial, kind: 'error', message: '网络失败' }))
      expect(container.querySelector('.app-update-toast')).toBeNull()
      expect(container.querySelector('.app-update-install-overlay')).toBeNull()
    } finally { unregister() }
  })
})
