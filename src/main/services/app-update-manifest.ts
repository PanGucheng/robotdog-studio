import semver from 'semver'
import { APP_RELEASE_API_ROOT, type AppUpdateEntry, type AppUpdateManifest } from '../../shared/app-update'
import { EDITION_PROFILES, type EditionId } from '../../shared/edition'

export function isStableVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) && semver.valid(value) === value
}
export function isNewerVersion(remote: string, current: string): boolean {
  return isStableVersion(remote) && semver.valid(current) !== null && semver.gt(remote, current)
}
export function installerFilename(edition: EditionId, version: string): string {
  if (!isStableVersion(version)) throw new Error('INVALID_APP_VERSION')
  return `${EDITION_PROFILES[edition].artifactSlug}-${version}-Windows-x64.exe`
}
export function installerDownloadUrl(edition: EditionId, version: string): string {
  return `${APP_RELEASE_API_ROOT}/releases/v${version}/attach_files/${installerFilename(edition, version)}/download`
}
export function validateAppUpdateEntry(value: unknown, edition: EditionId): AppUpdateEntry {
  if (!value || typeof value !== 'object') throw new Error('INVALID_UPDATE_ENTRY')
  const entry = value as AppUpdateEntry
  if (!isStableVersion(entry.version) || typeof entry.notes !== 'string' || entry.notes.length > 20_000 ||
    !Number.isSafeInteger(entry.size) || entry.size <= 0 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || typeof entry.url !== 'string') {
    throw new Error('INVALID_UPDATE_ENTRY')
  }
  const url = new URL(entry.url)
  const repo = new URL(APP_RELEASE_API_ROOT)
  const expected = new URL(installerDownloadUrl(edition, entry.version)).pathname
  if (url.origin !== repo.origin || url.username || url.password || url.search || url.hash || decodeURIComponent(url.pathname) !== expected) {
    throw new Error('INSTALLER_EDITION_OR_URL_MISMATCH')
  }
  return { version: entry.version, url: url.href, notes: entry.notes, size: entry.size, sha256: entry.sha256 }
}
export function parseAppUpdateManifest(value: unknown): AppUpdateManifest {
  if (!value || typeof value !== 'object') throw new Error('INVALID_UPDATE_MANIFEST')
  const manifest = value as AppUpdateManifest
  if (manifest.schemaVersion !== 1 || !manifest.editions || typeof manifest.editions !== 'object' || Array.isArray(manifest.editions)) throw new Error('INVALID_UPDATE_MANIFEST')
  const editions: AppUpdateManifest['editions'] = {}
  for (const [id, entry] of Object.entries(manifest.editions)) {
    if (!Object.hasOwn(EDITION_PROFILES, id)) throw new Error('INVALID_UPDATE_EDITION')
    editions[id as EditionId] = validateAppUpdateEntry(entry, id as EditionId)
  }
  return { schemaVersion: 1, editions }
}
