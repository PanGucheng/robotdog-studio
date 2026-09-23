import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FirmwareBaselineResolver } from './firmware-baseline-resolver'

describe('FirmwareBaselineResolver', () => {
  const staticRoot = join(process.cwd(), 'resources')
  const resolver = new FirmwareBaselineResolver({ staticRoot, isPackaged: false })

  it('resolves RHS baseline for RHS workspace', async () => {
    const service = resolver.resolveForWorkspace({ firmwareBaselineId: 'ch32v203-rhs-baseline' })
    const status = await service.getStatus()
    expect(status.id).toBe('ch32v203-rhs-baseline')
    expect(status.readyForTesting).toBe(true)
    expect(status.errors).toEqual([])
  })

  it('resolves Pony v2.5 baseline for Pony workspace', async () => {
    const service = resolver.resolveForWorkspace({ firmwareBaselineId: 'ch32v203-pony-v25' })
    const status = await service.getStatus()
    expect(status.id).toBe('ch32v203-pony-v25')
    expect(status.readyForTesting).toBe(true)
    expect(status.errors).toEqual([])
    expect(status.sourceRoot.replaceAll('\\', '/')).toContain('firmware/v2.5_')
  })

  it('throws for unknown baseline without falling back', () => {
    expect(() => resolver.resolveForWorkspace({ firmwareBaselineId: 'unknown-baseline-xyz' })).toThrow(/UNKNOWN_FIRMWARE_BASELINE/)
  })
})
