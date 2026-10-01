import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, openAsBlob } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { APP_RELEASE_REPOSITORY, APP_UPDATE_URL, type AppUpdateManifest } from '../src/shared/app-update'
import { parseEditionId } from '../src/shared/edition'
import { installerFilename, isStableVersion, parseAppUpdateManifest } from '../src/main/services/app-update-manifest'
import { fetchHttps } from '../src/main/services/app-update-service'
import { publishAppRelease, type ReleaseArtifact } from './app-release-publication'

const exec = promisify(execFile)
const sshRemote = 'git@gitee.com:Cidervinegar/robohorse-studio-releases.git'
const apiRoot = 'https://gitee.com/api/v5/repos/Cidervinegar/robohorse-studio-releases'

async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
export async function verifyAnonymousAttachment(artifact: Pick<ReleaseArtifact, 'size' | 'sha256'>, url: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const controller = new AbortController()
  let timer = setTimeout(() => controller.abort(), 15_000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await fetchHttps(fetchFn, url, { signal: controller.signal })
    clearTimeout(timer)
    if (!response.ok || !response.body) throw new Error(`ANONYMOUS_DOWNLOAD_HTTP_${response.status}`)
    reader = response.body.getReader()
    const hash = createHash('sha256')
    let bytes = 0
    for (;;) {
      timer = setTimeout(() => controller.abort(), 60_000)
      const item = await reader.read()
      clearTimeout(timer)
      if (item.done) break
      bytes += item.value.length
      if (bytes > artifact.size) throw new Error('REMOTE_ATTACHMENT_SIZE_MISMATCH')
      hash.update(item.value)
    }
    if (bytes !== artifact.size || hash.digest('hex') !== artifact.sha256) throw new Error('REMOTE_ATTACHMENT_INTEGRITY_FAILED')
  } finally {
    clearTimeout(timer); controller.abort()
    await reader?.cancel().catch(() => {})
  }
}

async function main(args: string[]): Promise<void> {
  if (args.includes('--help')) {
    console.log('tsx scripts/publish-app-release.ts [--publish] [--editions=mcu-foundations,ti-mspm0-foundations] [--notes-file=path]')
    return
  }
  const actualPublish = args.includes('--publish')
  const token = process.env.GITEE_TOKEN || (process.platform === 'win32'
    ? (await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::Write([Environment]::GetEnvironmentVariable("GITEE_TOKEN", "User"))'], { windowsHide: true })).stdout.trim()
    : undefined)
  if (actualPublish && !token) throw new Error('GITEE_TOKEN_MISSING: configure a publishing-only token locally; no remote changes were made')
  const root = process.cwd()
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  if (!isStableVersion(pkg.version)) throw new Error('INVALID_APP_VERSION')
  const requested = args.find(value => value.startsWith('--editions='))?.slice('--editions='.length) ?? 'mcu-foundations,ti-mspm0-foundations'
  const editions = requested.split(',').map(parseEditionId)
  const notesPath = args.find(value => value.startsWith('--notes-file='))?.slice('--notes-file='.length) ?? `docs/releases/${pkg.version}.md`
  const notes = await readFile(resolve(root, notesPath), 'utf8')
  if (!notes.trim() || notes.length > 20_000) throw new Error('INVALID_RELEASE_NOTES')
  const sourceCommit = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true })).stdout.trim()
  const dirty = Boolean((await exec('git', ['status', '--porcelain'], { cwd: root, windowsHide: true })).stdout.trim())
  const artifacts: ReleaseArtifact[] = []
  for (const editionId of editions) {
    const filename = installerFilename(editionId, pkg.version)
    const path = join(root, 'release', filename)
    const receipt = JSON.parse(await readFile(`${path}.release.json`, 'utf8'))
    const info = await stat(path)
    const sha256 = await fileHash(path)
    if (receipt.schemaVersion !== 1 || receipt.editionId !== editionId || receipt.version !== pkg.version || receipt.filename !== filename ||
      receipt.size !== info.size || receipt.sha256 !== sha256 || receipt.sourceCommit !== sourceCommit || receipt.sourceDirty || dirty) throw new Error(`BUILD_PROVENANCE_INVALID: ${filename}; build from the same clean commit`)
    artifacts.push({ editionId, version: pkg.version, filename, path, size: info.size, sha256, sourceCommit })
  }
  console.log(JSON.stringify({ mode: actualPublish ? 'publish' : 'dry-run', repository: APP_RELEASE_REPOSITORY, version: pkg.version,
    artifacts: artifacts.map(({ path: _path, ...item }) => item) }, null, 2))
  if (!actualPublish) return

  const workspace = await mkdtemp(join(tmpdir(), 'robohorse-release-'))
  const checkout = join(workspace, 'repo')
  const git = async (...gitArgs: string[]): Promise<string> => (await exec('git', gitArgs, { cwd: checkout, windowsHide: true, timeout: 120_000 })).stdout.trim()
  // API responses and request errors are never logged because they may contain
  // reflected credentials. Clients and anonymous verification never use token.
  const api = async (suffix: string, body?: object | FormData): Promise<unknown> => {
    const url = new URL(`${apiRoot}${suffix}`)
    let payload: BodyInit | undefined
    const headers: Record<string, string> = {}
    if (body instanceof FormData) { body.set('access_token', token!); payload = body }
    else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify({ ...body, access_token: token }) }
    else url.searchParams.set('access_token', token!)
    try {
      const response = await fetch(url, { method: body ? 'POST' : 'GET', body: payload, headers,
        signal: AbortSignal.timeout(body instanceof FormData ? 30 * 60_000 : 30_000) })
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { message?: unknown; msg?: unknown }
        const raw = typeof error.message === 'string' ? error.message : typeof error.msg === 'string' ? error.msg : ''
        const detail = raw.replaceAll(token!, '[redacted]').slice(0, 300)
        throw new Error(`GITEE_API_HTTP_${response.status}${detail ? `: ${detail}` : ''}`)
      }
      return await response.json()
    } catch (error) {
      const code = error instanceof Error && /^GITEE_API_HTTP_\d+/.test(error.message) ? error.message : 'GITEE_API_REQUEST_FAILED'
      throw new Error(code)
    }
  }
  try {
    const result = await publishAppRelease(artifacts, notes, {
      ensureRepository: async () => {
        await exec('git', ['clone', sshRemote, checkout], { windowsHide: true, timeout: 120_000 })
        const name = (await exec('git', ['config', 'user.name'], { cwd: root, windowsHide: true })).stdout.trim()
        const email = (await exec('git', ['config', 'user.email'], { cwd: root, windowsHide: true })).stdout.trim()
        await git('config', 'user.name', name); await git('config', 'user.email', email)
        const hasMain = await git('rev-parse', '--verify', 'origin/main').then(() => true, () => false)
        if (hasMain) await git('checkout', '-B', 'main', 'origin/main')
        else {
          await git('checkout', '--orphan', 'main')
          await writeFile(join(checkout, 'README.md'), '# RoboHorse Studio Releases\n\nPublic Windows installers are distributed as Release attachments. update.json is published only after anonymous download verification.\n')
          await git('add', 'README.md'); await git('commit', '-m', 'Initialize RoboHorse Studio release metadata')
          await git('push', '-u', 'origin', 'main')
        }
      },
      readManifest: async () => {
        const raw = await readFile(join(checkout, 'update.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
        return raw ? parseAppUpdateManifest(JSON.parse(raw)) : { schemaVersion: 1, editions: {} }
      },
      ensureRelease: async (version, body) => {
        const releases = await api('/releases?per_page=100') as Array<{ id: number; tag_name: string }>
        const existing = releases.find(release => release.tag_name === `v${version}`)
        if (existing) return existing.id
        const release = await api('/releases', { tag_name: `v${version}`, target_commitish: 'main', name: `RoboHorse Studio ${version}`, body, prerelease: false }) as { id: number }
        if (!Number.isSafeInteger(release.id)) throw new Error('INVALID_RELEASE_RESPONSE')
        return release.id
      },
      ensureAttachment: async (releaseId, artifact) => {
        const attachments = await api(`/releases/${releaseId}/attach_files`) as Array<{ name: string; browser_download_url?: string; download_url?: string }>
        const urlFor = (item: { browser_download_url?: string; download_url?: string }): string => item.browser_download_url ?? item.download_url ?? `${APP_RELEASE_REPOSITORY}/releases/download/v${artifact.version}/${artifact.filename}`
        const existing = attachments.find(item => item.name === artifact.filename)
        if (existing) return urlFor(existing) // Full anonymous integrity verification refuses different content.
        const form = new FormData()
        form.set('file', await openAsBlob(artifact.path, { type: 'application/octet-stream' }), artifact.filename)
        const uploaded = await api(`/releases/${releaseId}/attach_files`, form) as { browser_download_url?: string; download_url?: string }
        return urlFor(uploaded)
      },
      verifyAttachment: async (artifact, url) => {
        console.log(`Verifying anonymous download: ${artifact.filename}`)
        await verifyAnonymousAttachment(artifact, url)
      },
      publishManifest: async manifest => {
        // Refuse concurrent metadata changes instead of overwriting another release.
        await git('fetch', 'origin', 'main')
        if (await git('rev-parse', 'HEAD') !== await git('rev-parse', 'origin/main')) throw new Error('RELEASE_METADATA_CHANGED_RETRY')
        await writeFile(join(checkout, 'update.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        await git('add', 'update.json')
        if (await git('diff', '--cached', '--name-only')) {
          await git('commit', '-m', `Publish RoboHorse Studio ${pkg.version} update manifest`)
          await git('push', 'origin', 'main')
        }
      },
      verifyManifest: async manifest => {
        const response = await fetchHttps(fetch, APP_UPDATE_URL, { signal: AbortSignal.timeout(15_000), cache: 'no-store' })
        if (!response.ok) throw new Error(`PUBLIC_MANIFEST_HTTP_${response.status}`)
        const actual = parseAppUpdateManifest(await response.json())
        if (JSON.stringify(actual) !== JSON.stringify(manifest)) throw new Error('PUBLIC_MANIFEST_MISMATCH')
      }
    })
    console.log(`Published: ${APP_RELEASE_REPOSITORY}/releases/v${pkg.version}`)
    console.log(`Verified editions: ${Object.keys(result.editions).join(', ')}`)
  } finally {
    const withinTemp = relative(resolve(tmpdir()), resolve(workspace))
    if (!withinTemp || isAbsolute(withinTemp) || withinTemp.startsWith('..') || !withinTemp.startsWith('robohorse-release-')) throw new Error('PUBLISHER_CLEANUP_PATH_INVALID')
    await rm(workspace, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : 'RELEASE_FAILED'); process.exitCode = 1 })
}
