import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type {
  DeviceConnectionSnapshot,
  FirmwareBuildArtifact,
  FirmwareUpdateEvent,
  FirmwareUpdateSnapshot,
  FirmwareUpdateState,
  RobotStatus
} from '../../shared/types'
import { MockRobotService } from './mock-robot-service'

type ConnectivityEvents = {
  connection: [DeviceConnectionSnapshot]
  update: [FirmwareUpdateEvent]
}

const CANCELLABLE_STATES = new Set<FirmwareUpdateState>(['preflight', 'stopping', 'waiting_for_usb'])

export class MockConnectivityService extends EventEmitter<ConnectivityEvents> {
  private connection: DeviceConnectionSnapshot = {
    device: {
      id: 'RDS-SIM-001',
      name: '一号训练小马',
      board: 'CH32V203 RobotDog',
      hardwareVersion: 'SIM-A'
    },
    runtime: { state: 'disconnected' },
    updatePort: { state: 'disconnected' },
    updatedAt: new Date().toISOString()
  }
  private updateSnapshot: FirmwareUpdateSnapshot = this.idleUpdate()
  private artifact?: FirmwareBuildArtifact
  private operationToken = 0
  private failureAt?: 'writing' | 'verifying'

  constructor(private readonly robot: MockRobotService, private readonly stepDelayMs = 180) {
    super()
    robot.on('status', (status: RobotStatus) => this.syncRuntime(status))
  }

  getConnection(): DeviceConnectionSnapshot {
    return structuredClone(this.connection)
  }

  getUpdate(): FirmwareUpdateSnapshot {
    return { ...this.updateSnapshot }
  }

  setUsbConnected(connected: boolean): DeviceConnectionSnapshot {
    if (!connected && this.isActiveUpdate()) {
      this.operationToken += 1
      this.fail('USB 下载线已断开；重新连接后可以再次下载。')
    }
    this.setConnection({
      updatePort: connected
        ? { state: 'connected', port: 'SIM · USB COM12' }
        : { state: 'disconnected' }
    })
    if (connected && this.updateSnapshot.state === 'waiting_for_usb') void this.executeUpdate()
    return this.getConnection()
  }

  startUpdate(artifact: FirmwareBuildArtifact): FirmwareUpdateSnapshot {
    if (this.isActiveUpdate()) throw new Error('已有固件下载正在进行')
    if (artifact.kind !== 'bin') throw new Error('串口 IAP 只能下载 BIN 固件')
    this.artifact = artifact
    this.operationToken += 1
    this.updateSnapshot = {
      id: randomUUID(),
      state: 'preflight',
      artifactName: artifact.name,
      progress: 2,
      bytesWritten: 0,
      totalBytes: artifact.bytes ?? 27380,
      canCancel: true,
      message: '正在核对固件包、板型和构建身份…',
      targetVersion: 'RDS1 student-next',
      startedAt: new Date().toISOString()
    }
    this.emitUpdate('snapshot')
    void this.prepareUpdate(this.operationToken)
    return this.getUpdate()
  }

  retryUpdate(): FirmwareUpdateSnapshot {
    if (!this.artifact) throw new Error('没有可以重试的固件包')
    return this.startUpdate(this.artifact)
  }

  cancelUpdate(): FirmwareUpdateSnapshot {
    if (!CANCELLABLE_STATES.has(this.updateSnapshot.state)) {
      throw new Error('当前正在写入关键区域，请等待当前安全步骤完成')
    }
    this.operationToken += 1
    this.transition('cancelled', this.updateSnapshot.progress, '下载已安全取消', { completedAt: new Date().toISOString() })
    this.emitUpdate('cancelled')
    return this.getUpdate()
  }

  setFailureScenario(step?: 'writing' | 'verifying'): void {
    this.failureAt = step
  }

  private async prepareUpdate(token: number): Promise<void> {
    if (!(await this.pause(token))) return
    this.transition('stopping', 7, '正在让小马停止并进入安全姿态…')
    if (this.robot.getStatus().connection === 'ready') this.robot.runAction('stop')
    if (!(await this.pause(token))) return
    if (this.connection.updatePort.state === 'disconnected') {
      this.transition('waiting_for_usb', 10, '请连接板载 USB 下载线', { canCancel: true })
      return
    }
    await this.executeUpdate(token)
  }

  private async executeUpdate(existingToken?: number): Promise<void> {
    const token = existingToken ?? this.operationToken
    this.transition('entering_iap', 14, '正在切换到安全下载模式…')
    if (this.robot.getStatus().connection === 'ready') this.robot.disconnect()
    if (!(await this.pause(token))) return

    this.setConnection({ updatePort: { state: 'bootloader', port: 'SIM · USB COM12', bootloaderVersion: 'IAP 0.1' } })
    this.transition('bootloader_handshake', 20, '已识别一号训练小马 · Bootloader IAP 0.1')
    if (!(await this.pause(token))) return

    this.setConnection({ updatePort: { state: 'busy', port: 'SIM · USB COM12', bootloaderVersion: 'IAP 0.1' } })
    this.transition('erasing', 28, '正在准备 APP 固件区域…')
    if (!(await this.pause(token))) return

    for (const progress of [38, 49, 61, 72, 82]) {
      const bytesWritten = Math.round(this.updateSnapshot.totalBytes * ((progress - 32) / 54))
      this.transition('writing', progress, `正在写入固件 ${Math.min(bytesWritten, this.updateSnapshot.totalBytes)} / ${this.updateSnapshot.totalBytes} 字节`, { bytesWritten: Math.min(bytesWritten, this.updateSnapshot.totalBytes) })
      if (this.failureAt === 'writing' && progress >= 61) {
        this.failureAt = undefined
        this.operationToken += 1
        this.fail('模拟写入失败；Bootloader 仍然可用，可以重新下载。')
        return
      }
      if (!(await this.pause(token))) return
    }

    this.transition('verifying', 88, '正在校验整包 CRC32…', { bytesWritten: this.updateSnapshot.totalBytes })
    if (this.failureAt === 'verifying') {
      this.failureAt = undefined
      this.operationToken += 1
      this.fail('模拟校验失败；APP 未标记为有效。')
      return
    }
    if (!(await this.pause(token))) return

    this.transition('rebooting', 94, '校验通过，正在重新启动小马…')
    this.setConnection({ updatePort: { state: 'connected', port: 'SIM · USB COM12' } })
    if (!(await this.pause(token))) return

    this.transition('validating_app', 98, '正在验证新固件并恢复无线调试…')
    await this.robot.connectDemo()
    if (token !== this.operationToken) return
    this.transition('completed', 100, '下载完成，新固件已运行', {
      bytesWritten: this.updateSnapshot.totalBytes,
      canCancel: false,
      completedAt: new Date().toISOString()
    })
    this.emitUpdate('completed')
  }

  private syncRuntime(status: RobotStatus): void {
    this.setConnection({
      runtime: status.connection === 'ready'
        ? { state: 'ready', port: status.port, firmware: status.firmware, latencyMs: 18 }
        : status.connection === 'connecting'
          ? { state: 'handshaking', port: 'SIM · BT COM8' }
          : status.connection === 'error'
            ? { state: 'error' }
            : { state: 'disconnected' }
    })
  }

  private transition(state: FirmwareUpdateState, progress: number, message: string, patch: Partial<FirmwareUpdateSnapshot> = {}): void {
    this.updateSnapshot = {
      ...this.updateSnapshot,
      ...patch,
      state,
      progress,
      message,
      canCancel: patch.canCancel ?? CANCELLABLE_STATES.has(state),
      error: state === 'failed' ? patch.error : undefined
    }
    this.emitUpdate('progress')
  }

  private fail(message: string): void {
    this.transition('failed', this.updateSnapshot.progress, message, {
      error: message,
      canCancel: false,
      completedAt: new Date().toISOString()
    })
    this.emitUpdate('failed')
  }

  private setConnection(patch: Partial<DeviceConnectionSnapshot>): void {
    this.connection = { ...this.connection, ...patch, updatedAt: new Date().toISOString() }
    this.emit('connection', this.getConnection())
  }

  private emitUpdate(type: FirmwareUpdateEvent['type']): void {
    this.emit('update', { type, snapshot: this.getUpdate() })
  }

  private isActiveUpdate(): boolean {
    return !['idle', 'completed', 'failed', 'cancelled'].includes(this.updateSnapshot.state)
  }

  private async pause(token: number): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, this.stepDelayMs))
    return token === this.operationToken
  }

  private idleUpdate(): FirmwareUpdateSnapshot {
    return {
      state: 'idle',
      progress: 0,
      bytesWritten: 0,
      totalBytes: 0,
      canCancel: false,
      message: '编译固件后，可以通过板载 USB 下载到小马。'
    }
  }
}
