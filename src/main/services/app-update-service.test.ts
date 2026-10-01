import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_RELEASE_REPOSITORY, type AppUpdateEntry, type AppUpdateStatus } from '../../shared/app-update'
import type { EditionId } from '../../shared/edition'
import { AppUpdateService, fetchHttps } from './app-update-service'
import { installerFilename, isNewerVersion, parseAppUpdateManifest } from './app-update-manifest'
import { appUpdateConfiguration, resolveEditionIdentity } from './app-update-config'

const editionIds: EditionId[] = ['mcu-foundations', 'ti-mspm0-foundations', 'fun-line-following']
const payload = Buffer.from('MZ-test-installer-do-not-execute-'.repeat(1000))
const digest = createHash('sha256').update(payload).digest('hex')
function entry(id: EditionId, overrides: Partial<AppUpdateEntry> = {}): AppUpdateEntry {
  return { version: '1.1.0', url: `${APP_RELEASE_REPOSITORY}/releases/download/v1.1.0/${installerFilename(id, '1.1.0')}`,
    notes: '更新说明', size: payload.length, sha256: digest, ...overrides }
}
describe('App Update protocol and identity', () => {
  it('uses proper SemVer without downgrade or prerelease channels', () => {
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true)
    for (const value of ['1.0.0', '1.1.0', '1.1.0-beta.1', 'v1.2.0', '1.02.0', 'garbage']) expect(isNewerVersion(value, '1.1.0')).toBe(false)
    expect(isNewerVersion('1.1.0', '1.1.0+build.123')).toBe(false)
  })
  it('makes packaged edition immutable and allows development overrides', () => {
    expect(resolveEditionIdentity(true, 'ti-mspm0-foundations', { schemaVersion: 1, edition: 'mcu-foundations' })).toBe('mcu-foundations')
    expect(resolveEditionIdentity(false, 'ti-mspm0-foundations', undefined)).toBe('ti-mspm0-foundations')
    expect(() => resolveEditionIdentity(true, undefined, undefined)).toThrow()
  })
  it('disables development/provisional/smoke network checks and ignores implicit URL overrides', () => {
    expect(appUpdateConfiguration(false, 'win32', false, {}).enabled).toBe(false)
    expect(appUpdateConfiguration(true, 'win32', false, {}).enabled).toBe(false)
    expect(appUpdateConfiguration(true, 'win32', true, { ROBOTDOG_SMOKE_TEST: '1' }).enabled).toBe(false)
    expect(appUpdateConfiguration(true, 'win32', true, { ROBOTDOG_APP_UPDATE_URL: 'https://evil.test' }).updateUrl).not.toContain('evil')
    expect(appUpdateConfiguration(false, 'win32', false, { ROBOTDOG_APP_UPDATE_ENABLE: '1', ROBOTDOG_APP_UPDATE_URL: 'https://fixture.test' })).toEqual({ enabled: true, updateUrl: 'https://fixture.test' })
  })
  it.each([null, {}, { schemaVersion: 9, editions: {} }, { schemaVersion: 1, editions: [] }, { schemaVersion: 1, editions: { unknown: {} } }])('rejects invalid manifest %j', value => {
    expect(() => parseAppUpdateManifest(value)).toThrow()
  })
  it('rejects wrong editions, HTTP, remote hosts, and bad integrity metadata', () => {
    for (const overrides of [{ url: entry('ti-mspm0-foundations').url }, { url: entry('mcu-foundations').url.replace('https:', 'http:') },
      { url: entry('mcu-foundations').url.replace('gitee.com', 'evil.test') }, { size: 0 }, { sha256: 'bad' }]) {
      expect(() => parseAppUpdateManifest({ schemaVersion: 1, editions: { 'mcu-foundations': entry('mcu-foundations', overrides) } })).toThrow()
    }
  })
  it('rejects HTTPS to HTTP redirects before requesting the HTTP target', async () => {
    const transport = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://fixture.test/file' } }))
    await expect(fetchHttps(transport as typeof fetch, 'https://fixture.test', {})).rejects.toThrow('HTTPS_REQUIRED')
    expect(transport).toHaveBeenCalledTimes(1)
  })
})

describe('AppUpdateService with a local HTTP fixture (no Gitee)', () => {
  let root: string
  let server: Server
  let base: string
  let manifest: unknown
  let mode: 'normal' | 'truncated' | 'bad' | 'stall' | '404' = 'normal'
  let requests: string[]
  let fetchFn: typeof fetch
  beforeEach(async () => {
    mode = 'normal'
    root = await mkdtemp(join(tmpdir(), 'app-update-test-'))
    manifest = { schemaVersion: 1, editions: Object.fromEntries(editionIds.map(id => [id, entry(id)])) }
    requests = []
    server = createServer((request, response) => {
      requests.push(request.url!)
      if (request.url === '/manifest') { response.setHeader('Content-Type', 'application/json'); response.end(typeof manifest === 'string' ? manifest : JSON.stringify(manifest)); return }
      if (mode === '404') { response.writeHead(404); response.end(); return }
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' }) // Deliberately no Content-Length.
      if (mode === 'stall') { response.write(payload.subarray(0, 4)); return }
      if (mode === 'bad') { response.end(Buffer.alloc(payload.length)); return }
      if (mode === 'truncated') { response.end(payload.subarray(0, 5)); return }
      response.write(payload.subarray(0, 5000))
      const timer = setTimeout(() => response.end(payload.subarray(5000)), 225)
      response.on('close', () => clearTimeout(timer))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    fetchFn = ((url, init) => fetch(`${base}${String(url).includes('/raw/') ? '/manifest' : new URL(String(url)).pathname}`, init)) as typeof fetch
  })
  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  })
  function service(id: EditionId = 'mcu-foundations', options: Partial<ConstructorParameters<typeof AppUpdateService>[0]> = {}): AppUpdateService {
    return new AppUpdateService({ editionId: id, currentVersion: '1.0.0', updatesRoot: root, enabled: true, fetchFn, ...options })
  }
  it.each(editionIds)('downloads only the %s installer with progress, verifies, and reuses the full cache', async id => {
    const events: AppUpdateStatus[] = []
    const updater = service(id, { onStatus: value => events.push(value) })
    expect((await updater.checkForUpdate()).kind).toBe('available')
    const a = updater.downloadUpdate()
    const b = updater.downloadUpdate()
    expect(a).toBe(b)
    expect((await a).kind).toBe('ready')
    expect(requests).toContain(new URL(entry(id).url).pathname)
    expect(requests.filter(url => url.endsWith('.exe'))).toHaveLength(1)
    const progress = events.filter(value => value.kind === 'downloading').map(value => value.downloadedBytes)
    expect(progress[0]).toBe(0)
    expect(progress.at(-1)).toBe(payload.length)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
    expect(events.some(value => value.kind === 'verifying')).toBe(true)
    expect(await readFile(join(root, installerFilename(id, '1.1.0')))).toEqual(payload)
    expect((await readdir(root)).some(name => name.endsWith('.part'))).toBe(false)
    const restored = service(id)
    await restored.initialize()
    expect(restored.getStatus().kind).toBe('ready')
    await restored.downloadUpdate()
    expect(requests.filter(url => url.endsWith('.exe'))).toHaveLength(1)
  })
  it('does not fall back when the current edition has no release', async () => {
    manifest = { schemaVersion: 1, editions: { 'ti-mspm0-foundations': entry('ti-mspm0-foundations') } }
    const updater = service()
    expect((await updater.checkForUpdate()).kind).toBe('not-published')
    await updater.downloadUpdate()
    expect(requests).toEqual(['/manifest'])
  })
  it.each(['truncated', 'bad', '404', 'stall'] as const)('does not make %s downloads installable', async failure => {
    mode = failure
    const updater = service('mcu-foundations', { idleTimeoutMs: 50 })
    await updater.checkForUpdate()
    expect((await updater.downloadUpdate()).kind).toBe('error')
    expect((await readdir(root)).some(name => name.endsWith('.exe') || name.endsWith('.part'))).toBe(false)
  })
  it('handles invalid JSON, login HTML, schema errors, and network failures without throwing', async () => {
    const updater = service()
    for (const invalid of ['<html>login</html>', '{', 'x'.repeat(128_001), { schemaVersion: 99, editions: {} }]) {
      manifest = invalid
      expect((await updater.checkForUpdate()).kind).toBe('error')
    }
    const offline = service('mcu-foundations', { fetchFn: vi.fn().mockRejectedValue(new Error('OFFLINE')) })
    expect((await offline.checkForUpdate()).kind).toBe('error')
    const disabled = service('mcu-foundations', { enabled: false, fetchFn: vi.fn().mockRejectedValue(new Error('MUST_NOT_FETCH')) })
    expect((await disabled.checkForUpdate()).kind).toBe('disabled')
  })
  it('retains verified installers during offline checks and refuses a corrupt cache on restart', async () => {
    const updater = service()
    await updater.checkForUpdate(); await updater.downloadUpdate()
    const offline = service('mcu-foundations', { fetchFn: vi.fn().mockRejectedValue(new Error('OFFLINE')) })
    expect((await offline.checkForUpdate()).kind).toBe('ready')
    await writeFile(join(root, installerFilename('mcu-foundations', '1.1.0')), Buffer.alloc(payload.length))
    const corrupt = service()
    await corrupt.initialize()
    expect(corrupt.getStatus().kind).toBe('idle')
  })
  it('saves before launching and quits only after launch success', async () => {
    const order: string[] = []
    const updater = service('mcu-foundations', { prepareInstall: async () => { order.push('saved') }, launchInstaller: async path => { expect(path.startsWith(root)).toBe(true); order.push('launched'); return '' }, quit: () => { order.push('quit') } })
    await updater.checkForUpdate(); await updater.downloadUpdate()
    await updater.installUpdate()
    expect(order).toEqual(['saved', 'launched', 'quit'])
  })
  it.each(['save', 'launch', 'tamper', 'busy'])('does not quit when %s prevents installation', async failure => {
    const launch = vi.fn(async () => failure === 'launch' ? 'UAC_CANCELLED' : '')
    const quit = vi.fn()
    const updater = service('mcu-foundations', { prepareInstall: async () => { if (failure === 'save') throw new Error('SAVE_FAILED') }, launchInstaller: launch, quit })
    await updater.checkForUpdate(); await updater.downloadUpdate()
    if (failure === 'tamper') await writeFile(join(root, installerFilename('mcu-foundations', '1.1.0')), Buffer.alloc(payload.length))
    if (failure === 'busy') updater.setBusyGuard(() => true)
    const result = await updater.installUpdate()
    expect(['ready', 'error']).toContain(result.kind)
    expect(quit).not.toHaveBeenCalled()
    if (failure !== 'launch') expect(launch).not.toHaveBeenCalled()
  })
})
