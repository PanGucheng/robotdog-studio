import type { CcdFrame, FirmwareBuildEvent, FirmwareBuildSnapshot, LogEntry, RobotAction, RobotDogApi, RobotStatus, ToolchainStatus } from '../../../shared/types'

const statusListeners = new Set<(status: RobotStatus) => void>()
const logListeners = new Set<(entry: LogEntry) => void>()
const ccdListeners = new Set<(frame: CcdFrame) => void>()
const buildListeners = new Set<(event: FirmwareBuildEvent) => void>()

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
  onFirmwareBuild: (listener) => { buildListeners.add(listener); return () => buildListeners.delete(listener) }
}

export function getRobotApi(): RobotDogApi {
  return window.robotDog ?? browserDemoApi
}
