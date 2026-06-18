import { EventEmitter } from 'node:events'
import type { CcdFrame, LogEntry, RobotAction, RobotStatus } from '../../shared/types'

const ALLOWED_ACTIONS = new Set<RobotAction>([
  'walk',
  'back',
  'turnl',
  'turnr',
  'stop',
  'stand'
])

export class MockRobotService extends EventEmitter {
  private actionLease?: NodeJS.Timeout
  private frameIndex = 0
  private status: RobotStatus = {
    connection: 'disconnected',
    firmware: '等待连接',
    action: 'idle',
    lineValid: false,
    lineCenter: 64,
    targetCenter: 64,
    updatedAt: new Date().toISOString()
  }

  getStatus(): RobotStatus {
    return { ...this.status }
  }

  async connectDemo(): Promise<RobotStatus> {
    this.setStatus({ connection: 'connecting' })
    this.log('info', 'system', '正在与模拟机器马握手…')
    await new Promise((resolve) => setTimeout(resolve, 420))
    this.setStatus({
      connection: 'ready',
      port: 'SIM · COM8',
      firmware: 'RDS1 demo-0.1',
      action: 'idle',
      lineValid: true
    })
    this.log('success', 'serial', 'PONG · 模拟机器马已连接')
    return this.getStatus()
  }

  disconnect(): RobotStatus {
    this.stopLease()
    this.setStatus({
      connection: 'disconnected',
      port: undefined,
      firmware: '等待连接',
      action: 'idle',
      lineValid: false
    })
    this.log('info', 'system', '连接已断开')
    return this.getStatus()
  }

  runAction(action: unknown): RobotStatus {
    if (!ALLOWED_ACTIONS.has(action as RobotAction)) {
      throw new Error('不允许的机器马动作')
    }
    if (this.status.connection !== 'ready') {
      throw new Error('请先连接机器马')
    }

    const safeAction = action as RobotAction
    this.stopLease()
    this.setStatus({ action: safeAction === 'stop' ? 'idle' : safeAction })
    this.log(
      safeAction === 'stop' ? 'warning' : 'info',
      safeAction === 'stop' ? 'safety' : 'serial',
      safeAction === 'stop' ? 'STOP · 已发送软件急停' : `ACTION · ${safeAction}`
    )

    if (safeAction !== 'stop' && safeAction !== 'stand') {
      this.actionLease = setTimeout(() => {
        this.setStatus({ action: 'idle' })
        this.log('warning', 'safety', '动作已到 3 秒安全时限，自动停止')
      }, 3000)
    }
    return this.getStatus()
  }

  captureCcd(): CcdFrame {
    if (this.status.connection !== 'ready') {
      throw new Error('请先连接机器马')
    }
    this.frameIndex += 1
    const center = 68 + Math.round(Math.sin(this.frameIndex * 0.65) * 7)
    const pixels = Array.from({ length: 128 }, (_, index) => {
      const valley = Math.exp(-Math.pow(index - center, 2) / 65) * 150
      const ripple = Math.sin((index + this.frameIndex * 4) / 7) * 6
      return Math.max(18, Math.min(238, Math.round(210 - valley + ripple)))
    })
    const frame: CcdFrame = {
      pixels,
      threshold: 126,
      center,
      target: 64,
      valid: true,
      capturedAt: new Date().toISOString()
    }
    this.setStatus({ lineCenter: center, lineValid: true })
    this.emit('ccd', frame)
    this.log('success', 'serial', `CCD · 识别到黑线，中心 ${center}`)
    return frame
  }

  private setStatus(patch: Partial<RobotStatus>): void {
    this.status = { ...this.status, ...patch, updatedAt: new Date().toISOString() }
    this.emit('status', this.getStatus())
  }

  private log(level: LogEntry['level'], source: LogEntry['source'], message: string): void {
    this.emit('log', {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      level,
      source,
      message,
      timestamp: new Date().toISOString()
    } satisfies LogEntry)
  }

  private stopLease(): void {
    if (this.actionLease) {
      clearTimeout(this.actionLease)
      this.actionLease = undefined
    }
  }
}
