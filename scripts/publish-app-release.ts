import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { APP_RELEASE_REPOSITORY } from '../src/shared/app-update'
import { parseEditionId } from '../src/shared/edition'
import { installerFilename, isStableVersion } from '../src/main/services/app-update-manifest'
import { fetchHttps } from '../src/main/services/app-update-service'
import { publishAppRelease, type ReleaseArtifact } from './app-release-publication'
import { GitcodeAppRelease } from './gitcode-app-release'

const exec = promisify(execFile)

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
  const token = process.env.GITCODE_TOKEN || (process.platform === 'win32'
    ? (await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::Write([Environment]::GetEnvironmentVariable("GITCODE_TOKEN", "User"))'], { windowsHide: true })).stdout.trim()
    : undefined)
  if (actualPublish && !token) throw new Error('GITCODE_TOKEN_MISSING: configure a publishing-only token locally; no remote changes were made')
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

  const publisher = new GitcodeAppRelease(token!)
  const result = await publishAppRelease(artifacts, notes, {
    ensureRepository: () => publisher.ensureRepository(),
    readManifest: () => publisher.readManifest(),
    ensureRelease: (version, body) => publisher.ensureRelease(version, body),
    ensureAttachment: (tag, artifact) => publisher.ensureAttachment(tag, artifact),
    verifyAttachment: async (artifact, url) => {
      console.log(`Verifying anonymous download: ${artifact.filename}`)
      await verifyAnonymousAttachment(artifact, url)
    },
    publishManifest: manifest => publisher.publishManifest(manifest),
    verifyManifest: manifest => publisher.verifyManifest(manifest)
  })
  console.log(`Published: ${APP_RELEASE_REPOSITORY}/-/releases/v${pkg.version}`)
  console.log(`Verified editions: ${Object.keys(result.editions).join(', ')}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : 'RELEASE_FAILED'); process.exitCode = 1 })
}
