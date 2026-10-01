import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitcodeAppRelease } from '../../../scripts/gitcode-app-release'
import { APP_RELEASE_API_ROOT } from '../../shared/app-update'
import { installerDownloadUrl } from './app-update-manifest'
import type { ReleaseArtifact } from '../../../scripts/app-release-publication'

const token = 'fixture-publishing-secret'
const head = 'a'.repeat(40)
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

describe('GitCode release transport', () => {
  it('streams the installer to the signed PUT URL and returns an anonymous stable download URL', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gitcode-release-test-')); roots.push(root)
    const path = join(root, 'fixture.exe'); await writeFile(path, 'MZ-fixture')
    const artifact: ReleaseArtifact = { editionId: 'mcu-foundations', version: '1.1.0', filename: 'RoboHorse-Studio-MCU-1.1.0-Windows-x64.exe', path, size: 10, sha256: 'a'.repeat(64), sourceCommit: head }
    let uploaded = false
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.hostname === 'uploads.fixture.test') {
        expect(init?.method).toBe('PUT'); expect(init?.redirect).toBe('error')
        expect(init?.headers).toEqual({ 'Content-Type': 'application/octet-stream', 'x-obs-callback': 'callback-fixture' })
        expect(await (init?.body as Blob).text()).toBe('MZ-fixture')
        expect(url.href).not.toContain(token)
        uploaded = true; return json({ success: true })
      }
      expect(url.searchParams.get('access_token')).toBe(token)
      if (url.pathname.endsWith('/upload_url')) {
        expect(url.searchParams.get('file_name')).toBe(artifact.filename)
        return json({ url: 'https://uploads.fixture.test/asset?signature=test', headers: { 'Content-Type': 'application/octet-stream', 'x-obs-callback': 'callback-fixture' } })
      }
      return json({ tag_name: 'v1.1.0', assets: uploaded ? [{ name: artifact.filename }] : [] })
    })
    const publisher = new GitcodeAppRelease(token, fetchFn as typeof fetch)
    const url = await publisher.ensureAttachment('v1.1.0', artifact)
    expect(url).toBe(installerDownloadUrl(artifact.editionId, artifact.version))
    expect(url).not.toMatch(/access_token|signature/)
  })
  it('redacts reflected credentials in HTTP failures', async () => {
    const publisher = new GitcodeAppRelease(token, (async () => json({ message: `denied ${token}` }, 403)) as typeof fetch)
    await expect(publisher.ensureRepository()).rejects.toThrow('GITCODE_API_HTTP_403: denied [redacted]')
  })
  it('requires a public repository with main', async () => {
    const fetchFn = vi.fn(async () => json({ private: true, default_branch: 'main' }))
    await expect(new GitcodeAppRelease(token, fetchFn as typeof fetch).ensureRepository()).rejects.toThrow('RELEASE_REPOSITORY_MUST_BE_PUBLIC_MAIN')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
  it('refuses a concurrent main change before writing the manifest', async () => {
    let changed = false
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      expect(init?.method).toBe('GET')
      if (url.pathname === new URL(APP_RELEASE_API_ROOT).pathname) return json({ private: false, default_branch: 'main' })
      if (url.pathname.endsWith('/README.md')) return json({ sha: head, content: 'cmVhZG1l', encoding: 'base64' })
      return json({ commit: { id: changed ? 'b'.repeat(40) : head } })
    })
    const publisher = new GitcodeAppRelease(token, fetchFn as typeof fetch)
    await publisher.ensureRepository(); changed = true
    await expect(publisher.publishManifest({ schemaVersion: 1, editions: {} })).rejects.toThrow('RELEASE_METADATA_CHANGED_RETRY')
  })
  it('uses base64 metadata and checks its SHA before the final API commit', async () => {
    const writes: string[] = []
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      if (init?.method === 'POST') {
        writes.push(url.pathname)
        const body = JSON.parse(init.body as string)
        expect(body.branch).toBe('main'); expect(body).not.toHaveProperty('access_token')
        expect(JSON.parse(Buffer.from(body.content, 'base64').toString())).toEqual({ schemaVersion: 1, editions: {} })
        return json({ commit: { sha: 'b'.repeat(40) } })
      }
      if (url.pathname === new URL(APP_RELEASE_API_ROOT).pathname) return json({ private: false, default_branch: 'main' })
      if (url.pathname.endsWith('/README.md')) return json({ sha: head, content: 'cmVhZG1l', encoding: 'base64' })
      if (url.pathname.endsWith('/update.json')) return json({ message: 'not found' }, 404)
      return json({ commit: { id: head } })
    })
    const publisher = new GitcodeAppRelease(token, fetchFn as typeof fetch)
    await publisher.ensureRepository(); await publisher.readManifest()
    expect(writes).toEqual([])
    await publisher.publishManifest({ schemaVersion: 1, editions: {} })
    expect(writes).toHaveLength(1)
  })
})
