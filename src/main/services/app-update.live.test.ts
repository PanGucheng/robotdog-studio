import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { APP_UPDATE_URL } from '../../shared/app-update'
import { parseAppUpdateManifest } from './app-update-manifest'
import { AppUpdateService, fetchHttps } from './app-update-service'

it('anonymously reads the real Gitee manifest and fully verifies each published installer without installing', async () => {
  const response = await fetchHttps(fetch, APP_UPDATE_URL, { signal: AbortSignal.timeout(15_000), cache: 'no-store' })
  expect(response.ok).toBe(true)
  const manifest = parseAppUpdateManifest(await response.json())
  expect(Object.keys(manifest.editions).length).toBeGreaterThan(0)
  const root = await mkdtemp(join(tmpdir(), 'app-update-live-'))
  try {
    for (const editionId of Object.keys(manifest.editions) as Array<keyof typeof manifest.editions>) {
      let progress = false
      const updater = new AppUpdateService({ editionId, currentVersion: '0.0.0', updatesRoot: join(root, editionId), enabled: true,
        onStatus: status => { if (status.kind === 'downloading' && status.downloadedBytes > 0) progress = true } })
      expect((await updater.checkForUpdate()).kind).toBe('available')
      const result = await updater.downloadUpdate()
      expect(result.kind, result.error).toBe('ready')
      expect(progress).toBe(true)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30 * 60_000)
