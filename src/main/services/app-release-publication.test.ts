import { describe, expect, it, vi } from 'vitest'
import { APP_RELEASE_REPOSITORY } from '../../shared/app-update'
import { installerFilename } from './app-update-manifest'
import { publishAppRelease, type PublicationDependencies, type ReleaseArtifact } from '../../../scripts/app-release-publication'

const artifacts: ReleaseArtifact[] = ['mcu-foundations', 'ti-mspm0-foundations'].map(id => {
  const editionId = id as ReleaseArtifact['editionId']
  return { editionId, version: '1.1.0', filename: installerFilename(editionId, '1.1.0'), path: 'fixture.exe', size: 20, sha256: 'a'.repeat(64), sourceCommit: 'fixture-commit' }
})
function dependencies(order: string[], failure?: string): PublicationDependencies {
  return {
    ensureRepository: async () => { order.push('repository') },
    readManifest: async () => ({ schemaVersion: 1, editions: {} }),
    ensureRelease: async () => { order.push('release'); return 1 },
    ensureAttachment: async (_id, item) => { order.push(`upload:${item.editionId}`); if (failure === 'upload') throw new Error('UPLOAD_FAILED'); return `${APP_RELEASE_REPOSITORY}/releases/download/v${item.version}/${item.filename}` },
    verifyAttachment: async item => { order.push(`verify:${item.editionId}`); if (failure === item.editionId) throw new Error('HASH_MISMATCH') },
    publishManifest: vi.fn(async () => { order.push('manifest') }),
    verifyManifest: async () => { order.push('public-manifest') }
  }
}
describe('release manifest publication gate', () => {
  it('writes metadata only after every installer passes anonymous verification', async () => {
    const order: string[] = []
    const result = await publishAppRelease(artifacts, 'Notes', dependencies(order))
    expect(order).toEqual(['repository', 'release', 'upload:mcu-foundations', 'verify:mcu-foundations', 'upload:ti-mspm0-foundations', 'verify:ti-mspm0-foundations', 'manifest', 'public-manifest'])
    expect(Object.keys(result.editions)).toHaveLength(2)
  })
  it.each(['upload', 'mcu-foundations', 'ti-mspm0-foundations'])('never publishes a manifest after %s failure', async failure => {
    const deps = dependencies([], failure)
    await expect(publishAppRelease(artifacts, 'Notes', deps)).rejects.toThrow()
    expect(deps.publishManifest).not.toHaveBeenCalled()
  })
  it('refuses mixed commits or duplicated editions before any remote action', async () => {
    const deps = dependencies([])
    await expect(publishAppRelease([artifacts[0], { ...artifacts[1], sourceCommit: 'different' }], 'Notes', deps)).rejects.toThrow('RELEASE_ARTIFACTS_MISMATCH')
    await expect(publishAppRelease([artifacts[0], artifacts[0]], 'Notes', deps)).rejects.toThrow('RELEASE_ARTIFACTS_MISMATCH')
  })
})
