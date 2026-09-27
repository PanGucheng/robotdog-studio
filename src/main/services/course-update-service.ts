import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { CourseUpdateStatus } from '../../shared/types'
import type { CourseResolver } from './course-resolver'

const execFileAsync = promisify(execFile)

export interface CourseUpdateServiceOptions {
  userDataCoursesRoot: string
  resolver: CourseResolver
  appVersion: string
  editionId?: string
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
  private readonly editionId: string
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
    this.editionId = options.editionId ?? 'mcu-foundations'
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

  getEditionId(): string {
    return this.editionId
  }

  getLocalVersion(editionId?: string): number {
    return this.resolver.getCachedState(editionId ?? this.editionId)?.version ?? 0
  }

  getStatus(editionId?: string): CourseUpdateStatus {
    const targetEdition = editionId ?? this.editionId
    return {
      ...this.status,
      currentVersion: this.getLocalVersion(targetEdition)
    }
  }

  async checkForUpdate(
    arg?: string | { silent?: boolean; editionId?: string },
    _options?: { silent?: boolean }
  ): Promise<CourseUpdateStatus> {
    if (this.activeCheckPromise) {
      return this.activeCheckPromise
    }

    let targetEdition = this.editionId
    if (typeof arg === 'string') {
      targetEdition = arg
    } else if (arg && typeof arg === 'object' && arg.editionId) {
      targetEdition = arg.editionId
    }

    this.activeCheckPromise = this.performCheck(targetEdition)
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

  private async performCheck(targetEdition: string): Promise<CourseUpdateStatus> {
    const localVersion = this.getLocalVersion(targetEdition)
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
      if (!json || typeof json !== 'object') {
        throw new Error('INVALID_UPDATE_MANIFEST')
      }

      if (json.schemaVersion === 2 && json.editions && typeof json.editions === 'object') {
        const editionConfig = json.editions[targetEdition]
        if (!editionConfig || typeof editionConfig.version !== 'number' || typeof editionConfig.url !== 'string') {
          throw new Error(`EDITION_CONFIG_NOT_FOUND: ${targetEdition}`)
        }
        remoteData = {
          version: editionConfig.version,
          minAppVersion: typeof editionConfig.minAppVersion === 'string' ? editionConfig.minAppVersion : undefined,
          url: editionConfig.url
        }
      } else if (typeof json.version === 'number' && typeof json.url === 'string') {
        // Backwards compatibility with legacy V1 single-course update.json
        if (targetEdition === 'mcu-foundations') {
          remoteData = {
            version: json.version,
            minAppVersion: typeof json.minAppVersion === 'string' ? json.minAppVersion : undefined,
            url: json.url
          }
        } else {
          throw new Error(`EDITION_CONFIG_NOT_FOUND: ${targetEdition}`)
        }
      } else {
        throw new Error('INVALID_UPDATE_MANIFEST')
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
      await this.downloadAndApply(remoteData, targetEdition)
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
        currentVersion: this.getLocalVersion(targetEdition),
        lastCheckedAt: new Date().toISOString(),
        error: err
      }
      this.setStatus(failedStatus)
      return failedStatus
    }
  }

  private async downloadAndApply(remoteData: RemoteCourseManifest, targetEdition: string): Promise<void> {
    const editionDir = join(this.userDataCoursesRoot, targetEdition)
    const tempDir = join(editionDir, 'temp')
    const currentDir = this.resolver.getCurrentDir(targetEdition)
    const backupDir = join(editionDir, 'backup')
    const stateFile = this.resolver.getStateFile(targetEdition)

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
      if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.courses) || parsed.courses.length === 0) {
        throw new Error('INVALID_COURSE_ARCHIVE: catalog.json schema invalid')
      }

      // Verify course catalog matches expected edition
      const courses = parsed.courses as Array<{ courseId: string }>
      const matchesEdition = targetEdition === 'ti-mspm0-foundations'
        ? courses.some((c) => c.courseId.startsWith('ti-mspm0'))
        : courses.some((c) => c.courseId.startsWith('ch32'))

      if (!matchesEdition) {
        throw new Error(`COURSE_EDITION_MISMATCH: catalog does not match edition ${targetEdition}`)
      }

      // 4. Safe atomic swap transaction
      await mkdir(editionDir, { recursive: true })

      // Capture old state.json if present
      let oldStateContent: string | null = null
      if (existsSync(stateFile)) {
        oldStateContent = await readFile(stateFile, 'utf8')
      }

      if (existsSync(backupDir)) {
        await rm(backupDir, { recursive: true, force: true })
      }
      const hadCurrent = existsSync(currentDir)
      if (hadCurrent) {
        await rename(currentDir, backupDir)
      }

      let transactionCommitted = false
      try {
        // 4a. Move new content into currentDir
        await rename(contentRoot, currentDir)

        // 4b. Record new state.json
        const stateContent = JSON.stringify({
          version: remoteData.version,
          updatedAt: new Date().toISOString()
        }, null, 2)
        await writeFile(stateFile, stateContent, 'utf8')

        // 4c. Notify handler / reload course
        if (this.onCourseUpdated) {
          await this.onCourseUpdated(currentDir, {
            kind: 'updated',
            message: '课程更新完成',
            currentVersion: remoteData.version,
            remoteVersion: remoteData.version,
            lastCheckedAt: new Date().toISOString()
          })
        }

        transactionCommitted = true
      } catch (transErr) {
        // Rollback on any failure during steps 4a, 4b, or 4c
        try {
          if (existsSync(currentDir)) {
            await rm(currentDir, { recursive: true, force: true }).catch(() => {})
          }
          if (hadCurrent && existsSync(backupDir)) {
            await rename(backupDir, currentDir).catch(() => {})
          }
          if (oldStateContent !== null) {
            await writeFile(stateFile, oldStateContent, 'utf8').catch(() => {})
          } else if (existsSync(stateFile)) {
            await rm(stateFile, { force: true }).catch(() => {})
          }
        } catch (rollbackErr) {
          console.error('Critical: Failed to rollback course update transaction', rollbackErr)
        }
        throw transErr
      } finally {
        // 4d. Clean up backup only when transaction committed successfully
        if (transactionCommitted && existsSync(backupDir)) {
          await rm(backupDir, { recursive: true, force: true }).catch(() => {})
        }
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
