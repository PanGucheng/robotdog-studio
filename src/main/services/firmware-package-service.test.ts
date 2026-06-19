import { describe, expect, it } from 'vitest'
import { FirmwarePackageService, type FirmwarePackagePolicy } from './firmware-package-service'

const policy: FirmwarePackagePolicy = {
  board: 'robotdog-v1', chip: 'CH32V203', hardwareVersion: 'A',
  appRegionStart: 0x08005000, appRegionEnd: 0x08040000, maxImageBytes: 0x3b000
}

describe('FirmwarePackageService', () => {
  it('accepts a matching image outside the bootloader region', () => {
    const service = new FirmwarePackageService()
    const image = new Uint8Array([1, 2, 3, 4, 5])
    const manifest = service.createManifest(image, {
      board: 'robotdog-v1', chip: 'CH32V203', hardwareVersion: 'A', firmwareVersion: '1.2.0',
      protocolVersion: 'RDS1.0', appStart: 0x08005000, buildId: 'test-build'
    })
    expect(service.inspect(image, manifest, policy)).toMatchObject({ valid: true, errors: [] })
  })

  it('rejects writes into the bootloader and wrong boards', () => {
    const service = new FirmwarePackageService()
    const image = new Uint8Array([1, 2, 3])
    const manifest = service.createManifest(image, {
      board: 'another-board', chip: 'CH32V203', hardwareVersion: 'A', firmwareVersion: '1.0.0',
      protocolVersion: 'RDS1.0', appStart: 0x08000000, buildId: 'bad-build'
    })
    const inspection = service.inspect(image, manifest, policy)
    expect(inspection.valid).toBe(false)
    expect(inspection.errors.join(' ')).toContain('Bootloader')
    expect(inspection.errors.join(' ')).toContain('板型不匹配')
  })

  it('detects image tampering after manifest creation', () => {
    const service = new FirmwarePackageService()
    const image = new Uint8Array([1, 2, 3])
    const manifest = service.createManifest(image, {
      board: 'robotdog-v1', chip: 'CH32V203', hardwareVersion: 'A', firmwareVersion: '1.0.0',
      protocolVersion: 'RDS1.0', appStart: 0x08005000, buildId: 'test-build'
    })
    const changed = new Uint8Array([1, 2, 4])
    expect(service.inspect(changed, manifest, policy).errors).toEqual(expect.arrayContaining([
      '固件 CRC32 与清单不一致', '固件 SHA-256 与清单不一致'
    ]))
  })
})
