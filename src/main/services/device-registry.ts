export type DeviceLinkKind = 'runtime' | 'update'

export interface DeviceHandshake {
  deviceId: string
  name: string
  board: string
  hardwareVersion: string
  firmwareVersion?: string
  link: DeviceLinkKind
  portIdentity: string
  observedAt?: string
}

export interface RegisteredDevice {
  deviceId: string
  name: string
  board: string
  hardwareVersion: string
  firmwareVersion?: string
  links: Partial<Record<DeviceLinkKind, { portIdentity: string; lastSeenAt: string }>>
}

export class DeviceRegistry {
  private readonly devices = new Map<string, RegisteredDevice>()
  private readonly links = new Map<string, string>()

  observe(handshake: DeviceHandshake): RegisteredDevice {
    const deviceId = normalizeDeviceId(handshake.deviceId)
    const observedAt = handshake.observedAt ?? new Date().toISOString()
    const existing = this.devices.get(deviceId)
    if (existing && (existing.board !== handshake.board || existing.hardwareVersion !== handshake.hardwareVersion)) {
      throw new Error('同一设备 ID 报告了不同的板型或硬件版本')
    }
    const linkedDeviceId = this.links.get(handshake.portIdentity)
    if (linkedDeviceId && linkedDeviceId !== deviceId) throw new Error('同一端口身份不能同时属于两台机器马')

    const device: RegisteredDevice = existing ?? {
      deviceId,
      name: handshake.name,
      board: handshake.board,
      hardwareVersion: handshake.hardwareVersion,
      links: {}
    }
    device.name = handshake.name || device.name
    device.firmwareVersion = handshake.firmwareVersion ?? device.firmwareVersion
    device.links[handshake.link] = { portIdentity: handshake.portIdentity, lastSeenAt: observedAt }
    this.devices.set(deviceId, device)
    this.links.set(handshake.portIdentity, deviceId)
    return cloneDevice(device)
  }

  get(deviceId: string): RegisteredDevice | undefined {
    const device = this.devices.get(normalizeDeviceId(deviceId))
    return device ? cloneDevice(device) : undefined
  }

  findByPortIdentity(portIdentity: string): RegisteredDevice | undefined {
    const deviceId = this.links.get(portIdentity)
    return deviceId ? this.get(deviceId) : undefined
  }

  list(): RegisteredDevice[] {
    return [...this.devices.values()].map(cloneDevice).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  }

  forget(deviceId: string): boolean {
    const normalized = normalizeDeviceId(deviceId)
    const device = this.devices.get(normalized)
    if (!device) return false
    for (const link of Object.values(device.links)) if (link) this.links.delete(link.portIdentity)
    return this.devices.delete(normalized)
  }
}

function normalizeDeviceId(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9_-]{5,63}$/.test(normalized)) throw new Error('设备 ID 格式无效')
  return normalized
}

function cloneDevice(device: RegisteredDevice): RegisteredDevice {
  return { ...device, links: structuredClone(device.links) }
}
