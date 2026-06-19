import { describe, expect, it } from 'vitest'
import { DeviceRegistry } from './device-registry'

describe('DeviceRegistry', () => {
  it('associates runtime and update links by stable device ID', () => {
    const registry = new DeviceRegistry()
    registry.observe({ deviceId: 'rds-001', name: '一号小马', board: 'robotdog-v1', hardwareVersion: 'A', firmwareVersion: '1.0.0', link: 'runtime', portIdentity: 'bt:alpha' })
    registry.observe({ deviceId: 'RDS-001', name: '一号小马', board: 'robotdog-v1', hardwareVersion: 'A', link: 'update', portIdentity: 'usb:serial-001' })
    expect(registry.list()).toHaveLength(1)
    expect(registry.get('rds-001')?.links).toMatchObject({
      runtime: { portIdentity: 'bt:alpha' }, update: { portIdentity: 'usb:serial-001' }
    })
  })

  it('tracks a COM-number-independent port identity', () => {
    const registry = new DeviceRegistry()
    registry.observe({ deviceId: 'RDS-002', name: '二号小马', board: 'robotdog-v1', hardwareVersion: 'A', link: 'update', portIdentity: 'usb:unique-chip-id' })
    expect(registry.findByPortIdentity('usb:unique-chip-id')?.deviceId).toBe('RDS-002')
  })

  it('rejects conflicting identities', () => {
    const registry = new DeviceRegistry()
    registry.observe({ deviceId: 'RDS-003', name: '三号小马', board: 'robotdog-v1', hardwareVersion: 'A', link: 'runtime', portIdentity: 'bt:shared' })
    expect(() => registry.observe({ deviceId: 'RDS-004', name: '四号小马', board: 'robotdog-v1', hardwareVersion: 'A', link: 'runtime', portIdentity: 'bt:shared' })).toThrow('同一端口身份')
  })
})
