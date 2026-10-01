import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppUpdateStatus } from '../../../shared/app-update'
import { EDITION_PROFILES } from '../../../shared/edition'
import packageJson from '../../../../package.json'
import { getRobotApi } from '../lib/browser-demo-api'
import { flushPendingSaves } from '../lib/pending-saves'

const initial: AppUpdateStatus = { kind: 'disabled', editionId: 'fun-line-following', currentVersion: packageJson.version,
  downloadedBytes: 0, totalBytes: 0, message: '开发或测试模式未启用软件更新' }
interface UpdateContext { status: AppUpdateStatus; check(): void; download(): void; install(): void }
const Context = createContext<UpdateContext>({ status: initial, check() {}, download() {}, install() {} })
export const useAppUpdate = (): UpdateContext => useContext(Context)

export function AppUpdateProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const api = useMemo(() => getRobotApi(), [])
  const [status, setStatus] = useState(initial)
  const [dismissed, setDismissed] = useState<string>()
  const [foreground, setForeground] = useState(false)
  useEffect(() => {
    let disposed = false
    const update = (value: AppUpdateStatus): void => { if (!disposed) setStatus(value) }
    const unsubscribe = api.onAppUpdate?.(update)
    void api.getAppUpdateStatus?.().then(update).catch(() => {})
    const stopPrepare = api.onAppUpdatePrepare?.(id => {
      void (async () => {
        try { await flushPendingSaves(); await api.acknowledgeAppUpdatePrepare(id) }
        catch (error) { await api.acknowledgeAppUpdatePrepare(id, error instanceof Error ? error.message : String(error)) }
      })().catch(() => {})
    })
    return () => { disposed = true; unsubscribe?.(); stopPrepare?.() }
  }, [api])
  const execute = (action: () => Promise<AppUpdateStatus>, reveal = false): void => {
    setForeground(true)
    if (reveal) setDismissed(undefined)
    void action().then(setStatus).catch(error => setStatus(current => ({ ...current, kind: 'error', message: '软件更新操作失败，请重试', error: String(error) })))
  }
  const context = { status, check: () => execute(() => api.checkAppUpdate()), download: () => execute(() => api.downloadAppUpdate(), true), install: () => execute(() => api.installAppUpdate(), true) }
  const promptKey = `${status.targetVersion}:${status.kind === 'ready' ? 'ready' : status.kind === 'error' ? 'error' : 'available'}`
  const show = (['available', 'downloading', 'verifying', 'ready'].includes(status.kind) || (foreground && status.kind === 'error')) && dismissed !== promptKey
  return <Context.Provider value={context}>
    <div inert={status.kind === 'installing'}>{children}</div>
    {show && <aside className="app-update-toast" aria-label="软件更新" aria-live="polite">
      <strong>RoboHorse Studio {status.targetVersion ?? status.currentVersion}</strong>
      <p>{EDITION_PROFILES[status.editionId].shortName}</p>
      <AppUpdateControls />
      {['available', 'ready', 'error'].includes(status.kind) && <button type="button" className="settings-btn-secondary" onClick={() => setDismissed(promptKey)}>稍后</button>}
    </aside>}
    {status.kind === 'installing' && <div className="app-update-install-overlay" role="status">正在保存代码并启动安装器，请稍候…</div>}
  </Context.Provider>
}
export function AppUpdateControls(): React.JSX.Element {
  const { status, check, download, install } = useAppUpdate()
  const waiting = ['checking', 'downloading', 'verifying', 'installing'].includes(status.kind)
  return <section className="app-update-controls">
    <p role="status">{status.message}</p>
    {status.notes && <p className="app-update-notes">{status.notes}</p>}
    {['downloading', 'verifying'].includes(status.kind) && <div>
      <progress aria-label="软件下载进度" value={status.downloadedBytes} max={status.totalBytes || 1} />
      <p>{(status.downloadedBytes / 1048576).toFixed(1)} / {(status.totalBytes / 1048576).toFixed(1)} MB · {Math.floor(status.downloadedBytes / (status.totalBytes || 1) * 100)}%</p>
    </div>}
    <div className="settings-action-row">
      <button type="button" className="settings-btn-secondary" disabled={waiting || status.kind === 'disabled'} onClick={check}>检查软件更新</button>
      {(status.kind === 'available' || (status.kind === 'error' && status.targetVersion)) && <button type="button" className="settings-btn-primary" onClick={download}>下载更新</button>}
      {status.kind === 'ready' && <button type="button" className="settings-btn-primary" onClick={install}>立即安装</button>}
    </div>
  </section>
}
