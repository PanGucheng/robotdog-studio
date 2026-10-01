import { openAsBlob } from 'node:fs'
import { APP_RELEASE_API_ROOT, APP_UPDATE_URL, type AppUpdateManifest } from '../src/shared/app-update'
import { installerDownloadUrl, parseAppUpdateManifest } from '../src/main/services/app-update-manifest'
import { fetchHttps } from '../src/main/services/app-update-service'
import type { ReleaseArtifact } from './app-release-publication'

interface RepositoryFile { sha: string; content: string; encoding: string }
interface Release { tag_name: string; body?: string; assets: Array<{ name: string; id?: number }> }
class GitcodeApiError extends Error {
  constructor(readonly status: number, detail: string) { super(`GITCODE_API_HTTP_${status}${detail ? `: ${detail}` : ''}`) }
}

// Publishing credentials stay in this Node-only module. Signed upload URLs are
// short-lived and never enter update.json; clients use the stable public API URL.
export class GitcodeAppRelease {
  private manifestSha: string | undefined
  private head = ''
  constructor(private readonly token: string, private readonly fetchFn: typeof fetch = fetch) {}

  private async api<T>(suffix: string, method = 'GET', body?: object): Promise<T> {
    const url = new URL(`${APP_RELEASE_API_ROOT}${suffix}`)
    url.searchParams.set('access_token', this.token)
    try {
      const response = await this.fetchFn(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000), redirect: 'error' })
      if (!response.ok) {
        const value = await response.json().catch(() => ({})) as { message?: unknown; msg?: unknown }
        const message = typeof value.message === 'string' ? value.message : typeof value.msg === 'string' ? value.msg : ''
        throw new GitcodeApiError(response.status, message.replaceAll(this.token, '[redacted]').slice(0, 300))
      }
      return await response.json() as T
    } catch (error) {
      if (error instanceof GitcodeApiError) throw error
      throw new Error('GITCODE_API_REQUEST_FAILED')
    }
  }
  private async file(path: string): Promise<RepositoryFile | undefined> {
    try { return await this.api<RepositoryFile>(`/contents/${path}?ref=main`) }
    catch (error) { if (error instanceof GitcodeApiError && error.status === 404) return undefined; throw error }
  }
  private async branchHead(): Promise<string> {
    const branch = await this.api<{ commit: { id?: string; sha?: string } }>('/branches/main')
    const head = branch.commit?.id ?? branch.commit?.sha
    if (!head || !/^[a-f0-9]{40}$/.test(head)) throw new Error('INVALID_RELEASE_BRANCH')
    return head
  }
  private async writeFile(path: string, content: string, sha?: string): Promise<void> {
    await this.api(`/contents/${path}`, sha ? 'PUT' : 'POST', { branch: 'main', message: `Publish RoboHorse Studio ${path}`,
      content: Buffer.from(content).toString('base64'), ...(sha ? { sha } : {}) })
  }
  async ensureRepository(): Promise<void> {
    const repo = await this.api<{ private: boolean; default_branch: string }>('')
    if (repo.private || repo.default_branch !== 'main') throw new Error('RELEASE_REPOSITORY_MUST_BE_PUBLIC_MAIN')
    const readme = await this.file('README.md')
    if (!readme || !readme.content.trim()) await this.writeFile('README.md', '# RoboHorse Studio Releases\n\nPublic Windows installers are distributed as Release attachments. update.json is published only after anonymous download verification.\n', readme?.sha)
    this.head = await this.branchHead()
  }
  async readManifest(): Promise<AppUpdateManifest> {
    const file = await this.file('update.json')
    this.manifestSha = file?.sha
    if (!file) return { schemaVersion: 1, editions: {} }
    if (file.encoding !== 'base64') throw new Error('INVALID_RELEASE_FILE_ENCODING')
    return parseAppUpdateManifest(JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')))
  }
  async ensureRelease(version: string, notes: string): Promise<string> {
    const tag = `v${version}`
    try {
      const existing = await this.api<Release>(`/releases/tags/${tag}`)
      if (existing.body !== notes) await this.api(`/releases/${tag}`, 'PATCH', { name: `RoboHorse Studio ${version}`, body: notes, release_status: 'latest' })
    }
    catch (error) {
      if (!(error instanceof GitcodeApiError) || error.status !== 404) throw error
      const release = await this.api<Release>('/releases', 'POST', { tag_name: tag, target_commitish: 'main', name: `RoboHorse Studio ${version}`, body: notes, release_status: 'latest' })
      if (release.tag_name !== tag) throw new Error('INVALID_RELEASE_RESPONSE')
    }
    // Creating a tag must not change main; retain the manifest concurrency guard.
    return tag
  }
  async ensureAttachment(tag: string | number, artifact: ReleaseArtifact): Promise<string> {
    if (tag !== `v${artifact.version}`) throw new Error('RELEASE_TAG_MISMATCH')
    const release = await this.api<Release>(`/releases/tags/${tag}`)
    const url = installerDownloadUrl(artifact.editionId, artifact.version)
    if (release.assets.some(item => item.name === artifact.filename)) return url
    const upload = await this.api<{ url: string; headers: Record<string, string> }>(`/releases/${tag}/upload_url?file_name=${encodeURIComponent(artifact.filename)}`)
    const target = new URL(upload.url)
    if (target.protocol !== 'https:' || target.username || target.password || !upload.headers || Object.values(upload.headers).some(value => typeof value !== 'string')) throw new Error('INVALID_RELEASE_UPLOAD_RESPONSE')
    console.log(`Uploading: ${artifact.filename} (${artifact.size} bytes)`)
    let response: Response
    try { response = await this.fetchFn(target, { method: 'PUT', headers: upload.headers, body: await openAsBlob(artifact.path, { type: 'application/octet-stream' }),
      redirect: 'error', signal: AbortSignal.timeout(30 * 60_000) }) }
    catch { throw new Error('GITCODE_UPLOAD_REQUEST_FAILED') }
    if (!response.ok) throw new Error(`GITCODE_UPLOAD_HTTP_${response.status}`)
    await response.body?.cancel()
    const registered = await this.api<Release>(`/releases/tags/${tag}`)
    if (!registered.assets.some(item => item.name === artifact.filename)) throw new Error('RELEASE_ATTACHMENT_NOT_REGISTERED')
    return url
  }
  async publishManifest(manifest: AppUpdateManifest): Promise<void> {
    if (await this.branchHead() !== this.head) throw new Error('RELEASE_METADATA_CHANGED_RETRY')
    const current = await this.file('update.json')
    if (current?.sha !== this.manifestSha) throw new Error('RELEASE_METADATA_CHANGED_RETRY')
    const text = `${JSON.stringify(parseAppUpdateManifest(manifest), null, 2)}\n`
    if (current && Buffer.from(current.content, 'base64').toString('utf8') === text) return
    await this.writeFile('update.json', text, current?.sha)
  }
  async verifyManifest(manifest: AppUpdateManifest): Promise<void> {
    const response = await fetchHttps(this.fetchFn, APP_UPDATE_URL, { signal: AbortSignal.timeout(15_000), cache: 'no-store' })
    if (!response.ok) throw new Error(`PUBLIC_MANIFEST_HTTP_${response.status}`)
    const actual = parseAppUpdateManifest(await response.json())
    if (JSON.stringify(actual) !== JSON.stringify(manifest)) throw new Error('PUBLIC_MANIFEST_MISMATCH')
  }
}
