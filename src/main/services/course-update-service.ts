import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { CourseUpdateStatus } from '../../shared/types'
import type { CourseResolver } from './course-resolver'

const execFileAsync = promisify(execFile)

export interface CourseUpdateServiceOptions {
  userDataCoursesRoot: string
  resolver: CourseResolver
  appVersion: string
  updateUrl?: string
  fetchFn?: typeof fetch
  onCourseUpdated?: (newRoot: string, status: CourseUpdateStatus) => Promise<void> | void
  onStatusChange?: (status: CourseUpdateStatus) => void
}

export interface RemoteCourseManifest {
  version: number
  minAppVersion?: string
  url: string
}

export function isAppVersionCompatible(currentVersion: string, minAppVersion?: string): boolean {
  if (!minAppVersion) return true
  const currentParts = currentVersion.split('.').map((p) => parseInt(p, 10) || 0)
  const minParts = minAppVersion.split('.').map((p) => parseInt(p, 10) || 0)
  for (let i = 0; i < Math.max(currentParts.length, minParts.length); i++) {
    const cur = currentParts[i] ?? 0
    const min = minParts[i] ?? 0
    if (cur > min) return true
    if (cur < min) return false
  }
  return true
}

export class CourseUpdateService {
  private readonly userDataCoursesRoot: string
  private readonly resolver: CourseResolver
  private readonly appVersion: string
  private readonly updateUrl: string
  private readonly fetchFn: typeof fetch
  private readonly onCourseUpdated?: (newRoot: string, status: CourseUpdateStatus) => Promise<void> | void
  private readonly onStatusChange?: (status: CourseUpdateStatus) => void

  private status: CourseUpdateStatus
  private activeCheckPromise?: Promise<CourseUpdateStatus>

  constructor(options: CourseUpdateServiceOptions) {
    this.userDataCoursesRoot = resolve(options.userDataCoursesRoot)
    this.resolver = options.resolver
    this.appVersion = options.appVersion
    this.updateUrl = options.updateUrl ?? 'https://gitee.com/Cidervinegar/robohorse-courses/raw/master/update.json'
    this.fetchFn = options.fetchFn ?? globalThis.fetch
    this.onCourseUpdated = options.onCourseUpdated
    this.onStatusChange = options.onStatusChange

    const localVersion = this.getLocalVersion()
    this.status = {
      kind: 'idle',
      message: '',
      currentVersion: localVersion
    }
  }

  getLocalVersion(): number {
    return this.resolver.getCachedState()?.version ?? 0
  }

  getStatus(): CourseUpdateStatus {
    return {
      ...this.status,
      currentVersion: this.getLocalVersion()
    }
  }

  async checkForUpdate(_options?: { silent?: boolean }): Promise<CourseUpdateStatus> {
    if (this.activeCheckPromise) {
      return this.activeCheckPromise
    }

    this.activeCheckPromise = this.performCheck()
    try {
      return await this.activeCheckPromise
    } finally {
      this.activeCheckPromise = undefined
    }
  }

  private setStatus(status: CourseUpdateStatus): void {
    this.status = status
    this.onStatusChange?.(this.getStatus())
  }

  private async performCheck(): Promise<CourseUpdateStatus> {
    const localVersion = this.getLocalVersion()
    this.setStatus({
      kind: 'checking',
      message: '正在检查课程更新…',
      currentVersion: localVersion
    })

    let remoteData: RemoteCourseManifest
    try {
      const response = await this.fetchFn(this.updateUrl, {
        signal: AbortSignal.timeout(10_000)
      })
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`)
      }
      const json = await response.json()
      if (!json || typeof json.version !== 'number' || typeof json.url !== 'string') {
        throw new Error('INVALID_UPDATE_MANIFEST')
      }
      remoteData = {
        version: json.version,
        minAppVersion: typeof json.minAppVersion === 'string' ? json.minAppVersion : undefined,
        url: json.url
      }
    } catch (caught) {
      const err = caught instanceof Error ? caught.message : String(caught)
      const errorStatus: CourseUpdateStatus = {
        kind: 'error',
        message: '课程更新失败，继续使用当前版本',
        currentVersion: localVersion,
        lastCheckedAt: new Date().toISOString(),
        error: err
      }
      this.setStatus(errorStatus)
      return errorStatus
    }

    // Check application compatibility
    if (remoteData.minAppVersion && !isAppVersionCompatible(this.appVersion, remoteData.minAppVersion)) {
      const incompatibleStatus: CourseUpdateStatus = {
        kind: 'incompatible',
        message: '新版课程需要更新软件后使用',
        currentVersion: localVersion,
        remoteVersion: remoteData.version,
        minAppVersion: remoteData.minAppVersion,
        lastCheckedAt: new Date().toISOString()
      }
      this.setStatus(incompatibleStatus)
      return incompatibleStatus
    }

    // Compare versions
    if (remoteData.version <= localVersion) {
      const upToDateStatus: CourseUpdateStatus = {
        kind: 'up-to-date',
        message: '课程已是最新版本',
        currentVersion: localVersion,
        remoteVersion: remoteData.version,
        lastCheckedAt: new Date().toISOString()
      }
      this.setStatus(upToDateStatus)
      return upToDateStatus
    }

    // Download & update
    this.setStatus({
      kind: 'downloading',
      message: '正在下载课程…',
      currentVersion: localVersion,
      remoteVersion: remoteData.version,
      lastCheckedAt: new Date().toISOString()
    })

    try {
      await this.downloadAndApply(remoteData)
      const updatedStatus: CourseUpdateStatus = {
        kind: 'updated',
        message: '课程更新完成',
        currentVersion: remoteData.version,
        remoteVersion: remoteData.version,
        lastCheckedAt: new Date().toISOString()
      }
      this.setStatus(updatedStatus)
      return updatedStatus
    } catch (caught) {
      const err = caught instanceof Error ? caught.message : String(caught)
      const failedStatus: CourseUpdateStatus = {
        kind: 'error',
        message: '课程更新失败，继续使用当前版本',
        currentVersion: this.getLocalVersion(),
        lastCheckedAt: new Date().toISOString(),
        error: err
      }
      this.setStatus(failedStatus)
      return failedStatus
    }
  }

  private async downloadAndApply(remoteData: RemoteCourseManifest): Promise<void> {
    const tempDir = join(this.userDataCoursesRoot, 'temp')
    const currentDir = this.resolver.getCurrentDir()
    const backupDir = join(this.userDataCoursesRoot, 'backup')
    const stateFile = this.resolver.getStateFile()

    await mkdir(tempDir, { recursive: true })
    const zipPath = join(tempDir, 'course.zip')
    const extractedDir = join(tempDir, 'extracted')

    try {
      // 1. Download zip file
      const response = await this.fetchFn(remoteData.url, {
        signal: AbortSignal.timeout(60_000)
      })
      if (!response.ok) {
        throw new Error(`DOWNLOAD_FAILED_HTTP_${response.status}`)
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.byteLength === 0) {
        throw new Error('DOWNLOAD_EMPTY_FILE')
      }
      await writeFile(zipPath, buffer)

      // 2. Extract archive to temp/extracted
      await this.extractZip(zipPath, extractedDir)

      // 3. Verify extracted content
      let contentRoot = extractedDir
      if (!existsSync(join(contentRoot, 'catalog.json'))) {
        // If zip contained an intermediate folder (e.g. source/ or current/), locate it
        const entries = await readdir(extractedDir)
        const sub = entries.find((name) => existsSync(join(extractedDir, name, 'catalog.json')))
        if (sub) {
          contentRoot = join(extractedDir, sub)
        } else {
          throw new Error('INVALID_COURSE_ARCHIVE: catalog.json missing')
        }
      }

      const catalogRaw = await readFile(join(contentRoot, 'catalog.json'), 'utf8')
      const parsed = JSON.parse(catalogRaw)
      if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.courses)) {
        throw new Error('INVALID_COURSE_ARCHIVE: catalog.json schema invalid')
      }

      // 4. Safe swap
      await mkdir(this.userDataCoursesRoot, { recursive: true })
      if (existsSync(backupDir)) {
        await rm(backupDir, { recursive: true, force: true })
      }
      if (existsSync(currentDir)) {
        await rename(currentDir, backupDir)
      }

      try {
        await rename(contentRoot, currentDir)
        if (existsSync(backupDir)) {
          await rm(backupDir, { recursive: true, force: true })
        }
      } catch (swapErr) {
        // Rollback from backup if current was moved but extracted couldn't be placed
        if (!existsSync(currentDir) && existsSync(backupDir)) {
          await rename(backupDir, currentDir)
        }
        throw swapErr
      }

      // 5. Record version in state.json
      const stateContent = JSON.stringify({
        version: remoteData.version,
        updatedAt: new Date().toISOString()
      }, null, 2)
      await writeFile(stateFile, stateContent, 'utf8')

      // 6. Notify handler
      if (this.onCourseUpdated) {
        await this.onCourseUpdated(currentDir, {
          kind: 'updated',
          message: '课程更新完成',
          currentVersion: remoteData.version,
          remoteVersion: remoteData.version,
          lastCheckedAt: new Date().toISOString()
        })
      }
    } finally {
      // Clean temp directory
      if (existsSync(tempDir)) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {})
      }
    }
  }

  private async extractZip(zipPath: string, destDir: string): Promise<void> {
    await mkdir(destDir, { recursive: true })
    try {
      await execFileAsync('tar.exe', ['-xf', zipPath, '-C', destDir])
      return
    } catch {
      // Fallback to PowerShell Expand-Archive
      const command = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
      await execFileAsync('powershell', ['-NoProfile', '-Command', command])
    }
  }
}
