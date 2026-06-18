import type { CcdFrame, LogEntry, RobotAction, RobotDogApi, RobotStatus } from '../../../shared/types'

const statusListeners = new Set<(status: RobotStatus) => void>()
const logListeners = new Set<(entry: LogEntry) => void>()
const ccdListeners = new Set<(frame: CcdFrame) => void>()

let status: RobotStatus = {
  connection: 'disconnected',
  firmware: '等待连接',
  action: 'idle',
  lineValid: false,
  lineCenter: 64,
  targetCenter: 64,
  updatedAt: new Date().toISOString()
}
let frameIndex = 0

function update(patch: Partial<RobotStatus>): RobotStatus {
  status = { ...status, ...patch, updatedAt: new Date().toISOString() }
  statusListeners.forEach((listener) => listener({ ...status }))
  return { ...status }
}

function log(message: string, level: LogEntry['level'] = 'info'): void {
  const entry: LogEntry = {
    id: `${Date.now()}-${frameIndex}`,
    level,
    source: level === 'warning' ? 'safety' : 'system',
    message,
    timestamp: new Date().toISOString()
  }
  logListeners.forEach((listener) => listener(entry))
}

export const browserDemoApi: RobotDogApi = {
  getHealth: async () => ({ appVersion: '0.1.0', platform: 'browser', mode: 'simulation', checks: [] }),
  getStatus: async () => ({ ...status }),
  connectDemo: async () => {
    update({ connection: 'connecting' })
    await new Promise((resolve) => setTimeout(resolve, 280))
    log('PONG · 浏览器模拟设备已连接', 'success')
    return update({ connection: 'ready', port: 'SIM · COM8', firmware: 'RDS1 demo-0.1', lineValid: true })
  },
  disconnect: async () => update({ connection: 'disconnected', port: undefined, firmware: '等待连接', action: 'idle' }),
  runAction: async (action: RobotAction) => {
    if (status.connection !== 'ready') throw new Error('请先连接机器马')
    log(action === 'stop' ? 'STOP · 已发送软件急停' : `ACTION · ${action}`, action === 'stop' ? 'warning' : 'info')
    return update({ action: action === 'stop' ? 'idle' : action })
  },
  captureCcd: async () => {
    if (status.connection !== 'ready') throw new Error('请先连接机器马')
    frameIndex += 1
    const center = 68 + Math.round(Math.sin(frameIndex * 0.65) * 7)
    const frame: CcdFrame = {
      pixels: Array.from({ length: 128 }, (_, index) => Math.max(18, Math.round(210 - Math.exp(-Math.pow(index - center, 2) / 65) * 150))),
      threshold: 126,
      center,
      target: 64,
      valid: true,
      capturedAt: new Date().toISOString()
    }
    update({ lineCenter: center, lineValid: true })
    ccdListeners.forEach((listener) => listener(frame))
    log(`CCD · 识别到黑线，中心 ${center}`, 'success')
    return frame
  },
  onStatus: (listener) => { statusListeners.add(listener); return () => statusListeners.delete(listener) },
  onLog: (listener) => { logListeners.add(listener); return () => logListeners.delete(listener) },
  onCcd: (listener) => { ccdListeners.add(listener); return () => ccdListeners.delete(listener) }
}

export function getRobotApi(): RobotDogApi {
  return window.robotDog ?? browserDemoApi
}
