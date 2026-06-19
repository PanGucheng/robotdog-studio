import { EventEmitter } from 'node:events'
import type { RecoveryEvent, RecoverySnapshot, RecoveryState } from '../../shared/types'
import { MockRobotService } from './mock-robot-service'

type RecoveryEvents = { event: [RecoveryEvent] }

export class MockRecoveryService extends EventEmitter<RecoveryEvents> {
  private snapshot: RecoverySnapshot = { state: 'idle', progress: 0, message: '教师恢复待命', canCancel: false }
  private operationToken = 0

  constructor(private readonly robot: MockRobotService, private readonly stepDelayMs = 220) {
    super()
  }

  getSnapshot(): RecoverySnapshot {
    return { ...this.snapshot }
  }

  start(): RecoverySnapshot {
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(this.snapshot.state)) throw new Error('已有教师恢复任务正在进行')
    this.operationToken += 1
    this.snapshot = {
      state: 'preflight', progress: 4, message: '正在核对完整恢复镜像与目标板型…', imageName: 'RobotDog-Factory-Full.hex',
      canCancel: true, startedAt: new Date().toISOString()
    }
    this.emitEvent('snapshot')
    void this.run(this.operationToken)
    return this.getSnapshot()
  }

  cancel(): RecoverySnapshot {
    if (!this.snapshot.canCancel) throw new Error('完整 Flash 正在写入，请等待恢复完成')
    this.operationToken += 1
    this.transition('cancelled', this.snapshot.progress, '教师恢复已安全取消', { completedAt: new Date().toISOString() })
    this.emitEvent('cancelled')
    return this.getSnapshot()
  }

  private async run(token: number): Promise<void> {
    const steps: Array<[RecoveryState, number, string]> = [
      ['erasing', 18, '正在清理损坏的固件区域…'],
      ['writing_bootloader', 38, '正在恢复安全下载程序…'],
      ['writing_app', 70, '正在写入出厂应用固件…'],
      ['verifying', 88, '正在校验完整 Flash 镜像…'],
      ['resetting', 96, '校验通过，正在复位并检查启动…']
    ]
    for (const [state, progress, message] of steps) {
      if (!(await this.pause(token))) return
      if (state === 'erasing' && this.robot.getStatus().connection === 'ready') this.robot.disconnect()
      this.transition(state, progress, message)
    }
    if (!(await this.pause(token))) return
    await this.robot.connectDemo()
    if (token !== this.operationToken) return
    this.transition('completed', 100, '恢复完成，Bootloader 与出厂固件均已验证', { completedAt: new Date().toISOString() })
    this.emitEvent('completed')
  }

  private transition(state: RecoveryState, progress: number, message: string, patch: Partial<RecoverySnapshot> = {}): void {
    this.snapshot = { ...this.snapshot, ...patch, state, progress, message, canCancel: state === 'preflight' }
    this.emitEvent('progress')
  }

  private emitEvent(type: RecoveryEvent['type']): void {
    this.emit('event', { type, snapshot: this.getSnapshot() })
  }

  private async pause(token: number): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, this.stepDelayMs))
    return token === this.operationToken
  }
}
