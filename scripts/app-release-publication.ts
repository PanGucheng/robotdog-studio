import type { AppUpdateEntry, AppUpdateManifest } from '../src/shared/app-update'
import type { EditionId } from '../src/shared/edition'
import { parseAppUpdateManifest, validateAppUpdateEntry } from '../src/main/services/app-update-manifest'

export interface ReleaseArtifact {
  editionId: EditionId
  version: string
  filename: string
  path: string
  size: number
  sha256: string
  sourceCommit: string
}
export interface PublicationDependencies {
  ensureRepository(): Promise<void>
  readManifest(): Promise<AppUpdateManifest>
  ensureRelease(version: string, notes: string): Promise<number>
  ensureAttachment(releaseId: number, artifact: ReleaseArtifact): Promise<string>
  verifyAttachment(artifact: ReleaseArtifact, url: string): Promise<void>
  publishManifest(manifest: AppUpdateManifest): Promise<void>
  verifyManifest(manifest: AppUpdateManifest): Promise<void>
}

// No manifest write is reachable until every requested installer has been
// uploaded AND anonymously downloaded and verified.
export async function publishAppRelease(artifacts: ReleaseArtifact[], notes: string, deps: PublicationDependencies): Promise<AppUpdateManifest> {
  if (!artifacts.length || new Set(artifacts.map(item => item.editionId)).size !== artifacts.length ||
    new Set(artifacts.map(item => item.version)).size !== 1 || new Set(artifacts.map(item => item.sourceCommit)).size !== 1) throw new Error('RELEASE_ARTIFACTS_MISMATCH')
  await deps.ensureRepository()
  const previous = parseAppUpdateManifest(await deps.readManifest())
  const releaseId = await deps.ensureRelease(artifacts[0].version, notes)
  const manifest: AppUpdateManifest = { schemaVersion: 1, editions: { ...previous.editions } }
  for (const artifact of artifacts) {
    const url = await deps.ensureAttachment(releaseId, artifact)
    const entry: AppUpdateEntry = validateAppUpdateEntry({ version: artifact.version, url, notes, size: artifact.size, sha256: artifact.sha256 }, artifact.editionId)
    await deps.verifyAttachment(artifact, url)
    manifest.editions[artifact.editionId] = entry
  }
  parseAppUpdateManifest(manifest)
  await deps.publishManifest(manifest)
  await deps.verifyManifest(manifest)
  return manifest
}
