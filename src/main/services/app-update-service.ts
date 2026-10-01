import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { APP_UPDATE_URL, type AppUpdateEntry, type AppUpdateStatus } from '../../shared/app-update'
import type { EditionId } from '../../shared/edition'
import { installerFilename, isNewerVersion, parseAppUpdateManifest, validateAppUpdateEntry } from './app-update-manifest'

export interface AppUpdateServiceOptions {
  editionId: EditionId
  currentVersion: string
  updatesRoot: string
  enabled: boolean
  updateUrl?: string
  fetchFn?: typeof fetch
  onStatus?: (status: AppUpdateStatus) => void
  prepareInstall?: () => Promise<void>
  launchInstaller?: (path: string) => Promise<string>
  quit?: () => void
  connectionTimeoutMs?: number
  idleTimeoutMs?: number
}

// Production always calls this with the real fetch. Tests inject a local transport.
export async function fetchHttps(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (new URL(url).protocol !== 'https:') throw new Error('HTTPS_REQUIRED')
    const response = await fetchFn(url, { ...init, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const next = response.headers.get('location')
    await response.body?.cancel()
    if (!next) throw new Error('INVALID_REDIRECT')
    url = new URL(next, url).href
  }
  throw new Error('TOO_MANY_REDIRECTS')
}

export async function readAppUpdateManifest(response: Response): Promise<ReturnType<typeof parseAppUpdateManifest>> {
  if (!response.body) throw new Error('EMPTY_UPDATE_MANIFEST')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 128_000) throw new Error('MANIFEST_TOO_LARGE')
      chunks.push(value)
    }
    return parseAppUpdateManifest(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  } finally { await reader.cancel().catch(() => {}) }
}

export class AppUpdateService {
  private status: AppUpdateStatus
  private target?: AppUpdateEntry
  private active?: Promise<AppUpdateStatus>
  private readonly root: string
  private busyGuard: () => boolean = () => false
  private initialized: Promise<void>
  constructor(private readonly options: AppUpdateServiceOptions) {
    this.root = resolve(options.updatesRoot)
    this.status = { kind: options.enabled ? 'idle' : 'disabled', editionId: options.editionId, currentVersion: options.currentVersion,
      downloadedBytes: 0, totalBytes: 0, message: options.enabled ? '尚未检查软件更新' : '开发或测试模式未启用软件更新' }
    this.initialized = this.restoreCache()
  }
  setBusyGuard(guard: () => boolean): void { this.busyGuard = guard }
  getStatus(): AppUpdateStatus { return { ...this.status } }
  isInstalling(): boolean { return this.status.kind === 'installing' }
  async initialize(): Promise<void> { await this.initialized }
  private set(kind: AppUpdateStatus['kind'], message: string, patch: Partial<AppUpdateStatus> = {}): AppUpdateStatus {
    this.status = { ...this.status, kind, message, error: undefined, ...patch }
    this.options.onStatus?.(this.getStatus())
    return this.getStatus()
  }
  private run(work: () => Promise<AppUpdateStatus>): Promise<AppUpdateStatus> {
    if (this.active) return this.active
    const task = (async () => { await this.initialized; return work() })()
    this.active = task
    void task.finally(() => { if (this.active === task) this.active = undefined }).catch(() => {})
    return task
  }
  private path(entry: AppUpdateEntry): string { return join(this.root, installerFilename(this.options.editionId, entry.version)) }
  private async validFile(entry: AppUpdateEntry): Promise<boolean> {
    try {
      const path = this.path(entry)
      const info = await stat(path)
      if (!info.isFile() || info.size !== entry.size) return false
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(path)) hash.update(chunk)
      return hash.digest('hex') === entry.sha256
    } catch { return false }
  }
  private async restoreCache(): Promise<void> {
    if (!this.options.enabled) return
    try {
      const receipt = JSON.parse(await readFile(join(this.root, 'completed.json'), 'utf8'))
      if (receipt.editionId !== this.options.editionId) return
      const entry = validateAppUpdateEntry(receipt.entry, this.options.editionId)
      if (!isNewerVersion(entry.version, this.options.currentVersion) || !await this.validFile(entry)) return
      this.target = entry
      this.set('ready', '更新已下载，可以立即安装', { targetVersion: entry.version, notes: entry.notes, downloadedBytes: entry.size, totalBytes: entry.size })
    } catch { /* A missing or corrupt receipt never blocks startup. */ }
  }
  checkForUpdate(): Promise<AppUpdateStatus> {
    return this.run(async () => {
      if (!this.options.enabled) return this.getStatus()
      const previous = this.getStatus()
      this.set('checking', '正在检查软件更新…')
      try {
        const response = await fetchHttps(this.options.fetchFn ?? fetch, this.options.updateUrl ?? APP_UPDATE_URL, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP_${response.status}`)
        const entry = (await readAppUpdateManifest(response)).editions[this.options.editionId]
        this.target = entry
        const clean = { targetVersion: entry?.version, notes: entry?.notes, downloadedBytes: 0, totalBytes: entry?.size ?? 0 }
        if (!entry) return this.set('not-published', '该发行版暂未发布软件更新', clean)
        if (!isNewerVersion(entry.version, this.options.currentVersion)) return this.set('up-to-date', '当前软件已是最新版本', clean)
        if (await this.validFile(entry)) return this.set('ready', '更新已下载，可以立即安装', { ...clean, downloadedBytes: entry.size })
        return this.set('available', `发现 RoboHorse Studio ${entry.version}`, clean)
      } catch (error) {
        // An offline check must not discard an already verified installer.
        if (previous.kind === 'ready') return this.set('ready', '检查失败，已下载的更新仍可安装', { ...previous, error: String(error), kind: 'ready' })
        return this.set('error', '软件更新检查失败，请稍后重试', { error: String(error) })
      }
    })
  }
  downloadUpdate(): Promise<AppUpdateStatus> {
    return this.run(async () => {
      const entry = this.target
      if (!this.options.enabled || !entry || !isNewerVersion(entry.version, this.options.currentVersion)) return this.getStatus()
      const path = this.path(entry)
      const partial = `${path}.part`
      let file: Awaited<ReturnType<typeof open>> | undefined
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      let timer: ReturnType<typeof setTimeout> | undefined
      const controller = new AbortController()
      try {
        if (await this.validFile(entry)) return this.set('ready', '更新已下载，可以立即安装', { downloadedBytes: entry.size })
        await mkdir(this.root, { recursive: true })
        await rm(partial, { force: true })
        this.set('downloading', '正在下载软件更新…', { downloadedBytes: 0, totalBytes: entry.size })
        timer = setTimeout(() => controller.abort(), this.options.connectionTimeoutMs ?? 15_000)
        const response = await fetchHttps(this.options.fetchFn ?? fetch, entry.url, { signal: controller.signal })
        if (!response.ok || !response.body) throw new Error(`DOWNLOAD_HTTP_${response.status}`)
        clearTimeout(timer)
        const length = response.headers.get('content-length')
        if (length !== null && Number(length) !== entry.size) throw new Error('DOWNLOAD_SIZE_MISMATCH')
        file = await open(partial, 'w')
        reader = response.body.getReader()
        const hash = createHash('sha256')
        let bytes = 0
        let lastProgress = 0
        for (;;) {
          timer = setTimeout(() => controller.abort(), this.options.idleTimeoutMs ?? 60_000)
          const { done, value } = await reader.read()
          clearTimeout(timer)
          if (done) break
          bytes += value.byteLength
          if (bytes > entry.size) throw new Error('DOWNLOAD_SIZE_MISMATCH')
          hash.update(value)
          // writeFile writes the complete chunk, including short filesystem writes.
          await file.writeFile(value)
          if (Date.now() - lastProgress >= 200 || bytes === entry.size) {
            lastProgress = Date.now()
            this.set('downloading', '正在下载软件更新…', { downloadedBytes: bytes })
          }
        }
        this.set('verifying', '正在校验安装包…', { downloadedBytes: bytes })
        await file.sync()
        await file.close(); file = undefined
        if (bytes !== entry.size || hash.digest('hex') !== entry.sha256) throw new Error('DOWNLOAD_INTEGRITY_FAILED')
        await rm(path, { force: true })
        await rename(partial, path)
        await writeFile(join(this.root, 'completed.json.part'), JSON.stringify({ editionId: this.options.editionId, entry }, null, 2))
        await rename(join(this.root, 'completed.json.part'), join(this.root, 'completed.json'))
        return this.set('ready', '更新已下载，可以立即安装')
      } catch (error) {
        return this.set('error', '软件下载失败，请重试', { error: String(error) })
      } finally {
        clearTimeout(timer)
        controller.abort()
        await reader?.cancel().catch(() => {})
        await file?.close().catch(() => {})
        await rm(partial, { force: true }).catch(() => {})
      }
    })
  }
  installUpdate(): Promise<AppUpdateStatus> {
    return this.run(async () => {
      const entry = this.target
      if (this.status.kind !== 'ready' || !entry) return this.getStatus()
      if (this.busyGuard()) return this.set('ready', '请等待 AI、编译、烧录或教学内容更新完成后再安装')
      this.set('installing', '正在保存并启动安装器…')
      try {
        if (!this.options.prepareInstall || !this.options.launchInstaller || !this.options.quit) throw new Error('INSTALL_NOT_CONFIGURED')
        await this.options.prepareInstall()
        if (this.busyGuard()) throw new Error('APP_BUSY')
        if (!isNewerVersion(entry.version, this.options.currentVersion) || !await this.validFile(entry)) throw new Error('INSTALLER_INTEGRITY_FAILED')
        if (this.busyGuard()) throw new Error('APP_BUSY')
        const error = await this.options.launchInstaller(this.path(entry))
        if (error) throw new Error(error)
        this.options.quit()
        return this.getStatus()
      } catch (error) {
        if (!await this.validFile(entry)) return this.set('error', '安装包校验失败，请重新下载', { error: String(error) })
        return this.set('ready', '安装未启动，当前软件继续运行，可重试', { error: String(error) })
      }
    })
  }
}
