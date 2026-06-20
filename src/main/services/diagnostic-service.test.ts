import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppRuntimeInfo } from '../../shared/types'
import { DiagnosticService } from './diagnostic-service'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('DiagnosticService', () => {
  it('exports an atomic privacy-scoped report under managed data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-diagnostics-'))
    roots.push(root)
    const runtime: Omit<AppRuntimeInfo, 'dataRoot' | 'diagnosticsRoot'> = {
      mode: 'simulation', workspaceCount: 2,
      toolchain: {
        bundled: true, root: 'vendor',
        gcc: { ok: true, label: 'gcc', path: 'gcc.exe', detail: 'ready' },
        objcopy: { ok: true, label: 'objcopy', path: 'objcopy.exe', detail: 'ready' },
        size: { ok: true, label: 'size', path: 'size.exe', detail: 'ready' },
        openocd: { ok: true, label: 'openocd', path: 'openocd.exe', detail: 'ready' }
      },
      baseline: { id: 'test', label: '临时基线', sourceRoot: 'sdk', expectedCommit: 'a'.repeat(40), status: 'provisional', readyForTesting: true, releaseEligible: false, verifiedFiles: [], errors: [], warnings: [] },
      agent: { adapter: 'reasonix', version: 'v1', installed: true, apiKeyConfigured: true, ready: true, detail: 'ready' }
    }
    const service = new DiagnosticService({ dataRoot: root, getRuntimeInfo: async () => runtime, now: () => new Date('2026-06-20T12:00:00.000Z') })
    const result = await service.export()
    const report = await readFile(result.path, 'utf8')
    expect(result.path).toContain(join(root, 'diagnostics'))
    expect(report).toContain('固件基线校验')
    expect(report).not.toContain('apiKeyConfigured": "')
    expect(result.excluded).toContain('API Key')
  })
})
