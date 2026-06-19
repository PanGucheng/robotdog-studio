import type { CcdFrame, DeviceConnectionSnapshot, FirmwareBuildEvent, FirmwareBuildSnapshot, FirmwareUpdateEvent, FirmwareUpdateSnapshot, LogEntry, RecoveryEvent, RecoverySnapshot, RobotAction, RobotDogApi, RobotStatus, ToolchainStatus, WorkspaceSummary } from '../../../shared/types'

const statusListeners = new Set<(status: RobotStatus) => void>()
const logListeners = new Set<(entry: LogEntry) => void>()
const ccdListeners = new Set<(frame: CcdFrame) => void>()
const buildListeners = new Set<(event: FirmwareBuildEvent) => void>()
const connectionListeners = new Set<(snapshot: DeviceConnectionSnapshot) => void>()
const firmwareUpdateListeners = new Set<(event: FirmwareUpdateEvent) => void>()
const recoveryListeners = new Set<(event: RecoveryEvent) => void>()
const workspaceListeners = new Set<(workspace: WorkspaceSummary) => void>()

let demoWorkspaces: WorkspaceSummary[] = [{
  id: 'ws_0123456789abcdef01234567', name: '巡线基础训练', studentDisplayName: '林同学',
  templateId: 'ch32v203-robotdog', templateVersion: '2026.06', headCommit: '86d826a000000000000000000000000000000000',
  state: 'ready', updatedAt: new Date().toISOString()
}]

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
let browserUpdateToken = 0
let browserRecoveryToken = 0

let deviceConnection: DeviceConnectionSnapshot = {
  device: { id: 'RDS-WEB-001', name: '浏览器训练小马', board: 'CH32V203 RobotDog', hardwareVersion: 'WEB-A' },
  runtime: { state: 'disconnected' },
  updatePort: { state: 'disconnected' },
  updatedAt: new Date().toISOString()
}

let firmwareUpdate: FirmwareUpdateSnapshot = {
  state: 'idle', progress: 0, bytesWritten: 0, totalBytes: 0, canCancel: false,
  message: '编译固件后，可以通过板载 USB 下载到小马。'
}

let recoverySnapshot: RecoverySnapshot = { state: 'idle', progress: 0, message: '教师恢复待命', canCancel: false }

let buildSnapshot: FirmwareBuildSnapshot = {
  state: 'idle',
  firmwareRoot: 'D:\\RobotDog\\ch32v203-robot-dog',
  completedFiles: 0,
  totalFiles: 29,
  logs: [],
  artifacts: []
}

const demoToolchainStatus: ToolchainStatus = {
  bundled: true,
  root: 'vendor\\wch',
  gcc: { ok: true, label: 'WCH GCC12', path: 'vendor\\wch\\Toolchain\\RISC-V Embedded GCC12\\bin\\riscv-wch-elf-gcc.exe', version: 'riscv-wch-elf-gcc.exe 12.2.0', detail: 'riscv-wch-elf-gcc.exe 12.2.0' },
  objcopy: { ok: true, label: 'WCH objcopy', path: 'vendor\\wch\\Toolchain\\RISC-V Embedded GCC12\\bin\\riscv-wch-elf-objcopy.exe', version: '已就绪', detail: '已就绪' },
  size: { ok: true, label: 'WCH size', path: 'vendor\\wch\\Toolchain\\RISC-V Embedded GCC12\\bin\\riscv-wch-elf-size.exe', version: '已就绪', detail: '已就绪' },
  openocd: { ok: true, label: 'WCH OpenOCD', path: 'vendor\\wch\\OpenOCD\\OpenOCD\\bin\\openocd.exe', version: 'Open On-Chip Debugger demo', detail: 'Open On-Chip Debugger demo' }
}

function update(patch: Partial<RobotStatus>): RobotStatus {
  status = { ...status, ...patch, updatedAt: new Date().toISOString() }
  statusListeners.forEach((listener) => listener({ ...status }))
  deviceConnection = {
    ...deviceConnection,
    runtime: status.connection === 'ready'
      ? { state: 'ready', port: status.port, firmware: status.firmware, latencyMs: 16 }
      : status.connection === 'connecting' ? { state: 'handshaking', port: 'WEB · BT COM8' } : { state: 'disconnected' },
    updatedAt: new Date().toISOString()
  }
  connectionListeners.forEach((listener) => listener(structuredClone(deviceConnection)))
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

function emitBuild(event: FirmwareBuildEvent): void {
  buildListeners.forEach((listener) => listener(event))
}

function emitFirmwareUpdate(type: FirmwareUpdateEvent['type'], patch: Partial<FirmwareUpdateSnapshot>): void {
  firmwareUpdate = { ...firmwareUpdate, ...patch }
  firmwareUpdateListeners.forEach((listener) => listener({ type, snapshot: { ...firmwareUpdate } }))
}

function emitConnection(): void {
  deviceConnection = { ...deviceConnection, updatedAt: new Date().toISOString() }
  connectionListeners.forEach((listener) => listener(structuredClone(deviceConnection)))
}

function emitRecovery(type: RecoveryEvent['type'], patch: Partial<RecoverySnapshot>): void {
  recoverySnapshot = { ...recoverySnapshot, ...patch }
  recoveryListeners.forEach((listener) => listener({ type, snapshot: { ...recoverySnapshot } }))
}

async function runBrowserRecovery(token: number): Promise<void> {
  const steps: Array<[RecoverySnapshot['state'], number, string]> = [
    ['erasing', 18, '正在清理损坏的固件区域…'],
    ['writing_bootloader', 38, '正在恢复安全下载程序…'],
    ['writing_app', 70, '正在写入出厂应用固件…'],
    ['verifying', 88, '正在校验完整 Flash 镜像…'],
    ['resetting', 96, '校验通过，正在复位并检查启动…']
  ]
  for (const [state, progress, message] of steps) {
    await new Promise((resolve) => setTimeout(resolve, 220))
    if (token !== browserRecoveryToken) return
    emitRecovery('progress', { state, progress, message, canCancel: false })
  }
  update({ connection: 'ready', port: 'WEB · BT COM8', firmware: 'RDS1 factory-0.1', action: 'idle' })
  emitRecovery('completed', { state: 'completed', progress: 100, message: '恢复完成，Bootloader 与出厂固件均已验证', canCancel: false, completedAt: new Date().toISOString() })
}

async function runBrowserFirmwareUpdate(token: number): Promise<void> {
  const steps: Array<[FirmwareUpdateSnapshot['state'], number, string]> = [
    ['stopping', 7, '正在让小马停止并进入安全姿态…'],
    ['entering_iap', 14, '正在切换到安全下载模式…'],
    ['bootloader_handshake', 20, '已识别浏览器训练小马 · Bootloader IAP 0.1'],
    ['erasing', 28, '正在准备 APP 固件区域…'],
    ['writing', 46, '正在写入固件…'],
    ['writing', 68, '正在写入固件…'],
    ['writing', 82, '固件写入即将完成…'],
    ['verifying', 88, '正在校验整包 CRC32…'],
    ['rebooting', 94, '校验通过，正在重新启动小马…'],
    ['validating_app', 98, '正在验证新固件并恢复无线调试…']
  ]
  for (const [state, progress, message] of steps) {
    await new Promise((resolve) => setTimeout(resolve, 180))
    if (token !== browserUpdateToken) return
    if (state === 'entering_iap') update({ connection: 'disconnected', port: undefined, action: 'idle' })
    if (state === 'bootloader_handshake') {
      deviceConnection = { ...deviceConnection, updatePort: { state: 'bootloader', port: 'WEB · USB COM12', bootloaderVersion: 'IAP 0.1' } }
      emitConnection()
    }
    if (state === 'writing') {
      deviceConnection = { ...deviceConnection, updatePort: { state: 'busy', port: 'WEB · USB COM12', bootloaderVersion: 'IAP 0.1' } }
      emitConnection()
    }
    emitFirmwareUpdate('progress', { state, progress, message, canCancel: state === 'stopping', bytesWritten: Math.round((firmwareUpdate.totalBytes * progress) / 100) })
  }
  update({ connection: 'ready', port: 'WEB · BT COM8', firmware: 'RDS1 student-next', lineValid: true })
  deviceConnection = { ...deviceConnection, updatePort: { state: 'connected', port: 'WEB · USB COM12' } }
  emitConnection()
  emitFirmwareUpdate('completed', { state: 'completed', progress: 100, bytesWritten: firmwareUpdate.totalBytes, message: '下载完成，新固件已运行', canCancel: false, completedAt: new Date().toISOString() })
}

export const browserDemoApi: RobotDogApi = {
  getHealth: async () => ({ appVersion: '0.1.0', platform: 'browser', mode: 'simulation', checks: [] }),
  getStatus: async () => ({ ...status }),
  getToolchainStatus: async () => demoToolchainStatus,
  startFirmwareBuild: async () => {
    buildSnapshot = {
      state: 'running',
      firmwareRoot: 'D:\\RobotDog\\ch32v203-robot-dog',
      outputDir: '.firmware-build\\demo',
      completedFiles: 0,
      totalFiles: 29,
      logs: ['浏览器演示：开始模拟编译'],
      artifacts: [],
      startedAt: new Date().toISOString()
    }
    emitBuild({ type: 'snapshot', snapshot: buildSnapshot })
    for (let index = 1; index <= 29; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 28))
      buildSnapshot = {
        ...buildSnapshot,
        completedFiles: index,
        currentFile: index < 29 ? `模拟源文件 ${index}.c` : '链接 GPIO_Toggle.elf',
        logs: [...buildSnapshot.logs.slice(-20), `[${index}/29] 模拟源文件 ${index}`]
      }
      emitBuild({ type: 'progress', snapshot: buildSnapshot })
    }
    buildSnapshot = {
      ...buildSnapshot,
      state: 'completed',
      currentFile: undefined,
      completedAt: new Date().toISOString(),
      size: { text: 27380, data: 236, bss: 3476, dec: 31092, hex: '7974' },
      artifacts: [
        { name: 'GPIO_Toggle.elf', path: '.firmware-build\\demo\\GPIO_Toggle.elf', kind: 'elf', bytes: 213592 },
        { name: 'GPIO_Toggle.hex', path: '.firmware-build\\demo\\GPIO_Toggle.hex', kind: 'hex', bytes: 77709 },
        { name: 'GPIO_Toggle.bin', path: '.firmware-build\\demo\\GPIO_Toggle.bin', kind: 'bin', bytes: 27380 }
      ]
    }
    emitBuild({ type: 'completed', snapshot: buildSnapshot })
    return buildSnapshot
  },
  cancelFirmwareBuild: async () => {
    buildSnapshot = { ...buildSnapshot, state: 'cancelled', completedAt: new Date().toISOString(), error: '浏览器演示已取消' }
    emitBuild({ type: 'cancelled', snapshot: buildSnapshot })
    return buildSnapshot
  },
  getDeviceConnection: async () => structuredClone(deviceConnection),
  setDemoUsbConnected: async (connected) => {
    deviceConnection = { ...deviceConnection, updatePort: connected ? { state: 'connected', port: 'WEB · USB COM12' } : { state: 'disconnected' }, updatedAt: new Date().toISOString() }
    emitConnection()
    if (connected && firmwareUpdate.state === 'waiting_for_usb') void runBrowserFirmwareUpdate(browserUpdateToken)
    return structuredClone(deviceConnection)
  },
  getFirmwareUpdate: async () => ({ ...firmwareUpdate }),
  startFirmwareUpdate: async () => {
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(recoverySnapshot.state)) throw new Error('教师恢复进行中，不能同时下载学生固件')
    if (buildSnapshot.state !== 'completed') throw new Error('请先完成固件编译')
    const bin = buildSnapshot.artifacts.find((artifact) => artifact.kind === 'bin')
    if (!bin) throw new Error('编译产物中没有 BIN 固件')
    browserUpdateToken += 1
    firmwareUpdate = { id: `web-${Date.now()}`, state: 'preflight', artifactName: bin.name, progress: 2, bytesWritten: 0, totalBytes: bin.bytes ?? 27380, canCancel: true, message: '正在核对固件包、板型和构建身份…', targetVersion: 'RDS1 student-next', startedAt: new Date().toISOString() }
    emitFirmwareUpdate('snapshot', {})
    if (deviceConnection.updatePort.state === 'disconnected') {
      const token = browserUpdateToken
      setTimeout(() => {
        if (token === browserUpdateToken) emitFirmwareUpdate('progress', { state: 'waiting_for_usb', progress: 10, message: '请连接板载 USB 下载线', canCancel: true })
      }, 180)
    } else void runBrowserFirmwareUpdate(browserUpdateToken)
    return { ...firmwareUpdate }
  },
  cancelFirmwareUpdate: async () => {
    if (!firmwareUpdate.canCancel) throw new Error('当前正在写入关键区域，请等待当前安全步骤完成')
    browserUpdateToken += 1
    emitFirmwareUpdate('cancelled', { state: 'cancelled', message: '下载已安全取消', canCancel: false, completedAt: new Date().toISOString() })
    return { ...firmwareUpdate }
  },
  getRecovery: async () => ({ ...recoverySnapshot }),
  startRecovery: async () => {
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(firmwareUpdate.state)) throw new Error('学生固件下载进行中，不能同时执行教师恢复')
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(recoverySnapshot.state)) throw new Error('已有教师恢复任务正在进行')
    browserRecoveryToken += 1
    recoverySnapshot = { state: 'preflight', progress: 4, message: '正在核对完整恢复镜像与目标板型…', imageName: 'RobotDog-Factory-Full.hex', canCancel: true, startedAt: new Date().toISOString() }
    emitRecovery('snapshot', {})
    void runBrowserRecovery(browserRecoveryToken)
    return { ...recoverySnapshot }
  },
  cancelRecovery: async () => {
    if (!recoverySnapshot.canCancel) throw new Error('完整 Flash 正在写入，请等待恢复完成')
    browserRecoveryToken += 1
    emitRecovery('cancelled', { state: 'cancelled', message: '教师恢复已安全取消', canCancel: false, completedAt: new Date().toISOString() })
    return { ...recoverySnapshot }
  },
  listWorkspaces: async () => structuredClone(demoWorkspaces),
  createWorkspace: async (input) => {
    const workspace: WorkspaceSummary = {
      id: `ws_${Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24)}`,
      name: input.name.trim(), studentDisplayName: input.studentDisplayName.trim(), templateId: 'ch32v203-robotdog',
      templateVersion: '2026.06', headCommit: 'demo000000000000000000000000000000000000', state: 'ready', updatedAt: new Date().toISOString()
    }
    demoWorkspaces = [workspace, ...demoWorkspaces]
    workspaceListeners.forEach((listener) => listener(structuredClone(workspace)))
    return structuredClone(workspace)
  },
  getWorkspace: async (workspaceId) => {
    const workspace = demoWorkspaces.find((item) => item.id === workspaceId)
    if (!workspace) throw new Error('训练项目不存在')
    return structuredClone(workspace)
  },
  getWorkspaceHistory: async (workspaceId) => [{ commit: (await browserDemoApi.getWorkspace(workspaceId)).headCommit, shortCommit: 'demo000', message: 'chore: initialize student workspace', createdAt: new Date().toISOString() }],
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
  onCcd: (listener) => { ccdListeners.add(listener); return () => ccdListeners.delete(listener) },
  onFirmwareBuild: (listener) => { buildListeners.add(listener); return () => buildListeners.delete(listener) },
  onDeviceConnection: (listener) => { connectionListeners.add(listener); return () => connectionListeners.delete(listener) },
  onFirmwareUpdate: (listener) => { firmwareUpdateListeners.add(listener); return () => firmwareUpdateListeners.delete(listener) },
  onRecovery: (listener) => { recoveryListeners.add(listener); return () => recoveryListeners.delete(listener) },
  onWorkspaceChanged: (listener) => { workspaceListeners.add(listener); return () => workspaceListeners.delete(listener) }
}

export function getRobotApi(): RobotDogApi {
  return window.robotDog ?? browserDemoApi
}
