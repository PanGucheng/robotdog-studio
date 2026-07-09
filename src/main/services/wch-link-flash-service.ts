import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { WchLinkFlashEvent, WchLinkFlashSnapshot, WchLinkProbeInfo } from '../../shared/types'
import { ToolchainService } from './toolchain-service'

type WchLinkFlashServiceEvents = { event: [WchLinkFlashEvent] }

const ACTIVE_STATES = new Set(['probing', 'flashing', 'verifying', 'resetting'])

export class WchLinkFlashService extends EventEmitter<WchLinkFlashServiceEvents> {
  private activeProcess?: ChildProcessWithoutNullStreams
  private snapshot: WchLinkFlashSnapshot = this.makeIdleSnapshot()

  constructor(private readonly toolchain: ToolchainService, private readonly timeoutMs = 12_000) {
    super()
  }

  getSnapshot(): WchLinkFlashSnapshot {
    return structuredClone(this.snapshot)
  }

  async probe(): Promise<WchLinkFlashSnapshot> {
    if (ACTIVE_STATES.has(this.snapshot.state)) throw new Error('WCH-Link 操作正在进行，请稍等。')
    const openocd = this.toolchain.getOpenocdPath()
    const config = this.toolchain.getOpenocdRiscvConfigPath()
    if (!existsSync(openocd)) return this.fail(`没有找到内置 WCH OpenOCD：${openocd}`)
    if (!existsSync(config)) return this.fail(`没有找到 WCH RISC-V OpenOCD 配置：${config}`)

    this.snapshot = {
      state: 'probing',
      progress: 12,
      message: '正在检测 WCH-Link 和 CH32V203…',
      canCancel: true,
      logs: [],
      startedAt: new Date().toISOString()
    }
    this.emitSnapshot('snapshot')

    try {
      const output = await this.runOpenocd(openocd, ['-f', config, '-c', 'init', '-c', 'halt', '-c', 'flash banks', '-c', 'exit'])
      const probe = parseWchLinkProbeOutput(output)
      if (!probe.adapterName) throw new Error('没有识别到 WCH-Link，请检查 USB、驱动和烧录器模式。')
      if (!probe.targetExamined) throw new Error('烧录器已连接，但没有识别到芯片。请检查目标板供电、GND、SWDIO、SWCLK 和 NRST。')
      this.snapshot = {
        ...this.snapshot,
        state: 'target_ready',
        progress: 100,
        message: `${probe.adapterName}${probe.adapterVersion ? ` ${probe.adapterVersion}` : ''} 已连接，芯片识别成功。`,
        canCancel: false,
        probe,
        completedAt: new Date().toISOString()
      }
      this.emitSnapshot('completed')
      return this.getSnapshot()
    } catch (caught) {
      return this.fail(mapOpenOcdError(caught))
    }
  }

  flashCurrent(): WchLinkFlashSnapshot {
    return this.fail('真实写入当前程序将在下一步接入；当前页面已先支持安全检测烧录器与芯片。')
  }

  cancel(): WchLinkFlashSnapshot {
    if (!this.snapshot.canCancel || !this.activeProcess) return this.getSnapshot()
    this.activeProcess.kill()
    this.snapshot = {
      ...this.snapshot,
      state: 'cancelled',
      progress: this.snapshot.progress,
      message: 'WCH-Link 检测已取消。',
      canCancel: false,
      completedAt: new Date().toISOString()
    }
    this.emitSnapshot('cancelled')
    return this.getSnapshot()
  }

  private runOpenocd(command: string, args: string[]): Promise<string> {
    return new Promise((resolveRun, reject) => {
      const child = spawn(command, args, { windowsHide: true, shell: false, env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' } })
      this.activeProcess = child
      let output = ''
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error('OpenOCD 长时间没有响应。请断开重连 WCH-Link 和目标板后重试。'))
      }, this.timeoutMs)
      const capture = (chunk: Buffer): void => {
        const text = chunk.toString('utf8')
        output += text
        this.addLog(text)
      }
      child.stdout.on('data', capture)
      child.stderr.on('data', capture)
      child.on('error', (error) => {
        clearTimeout(timeout)
        this.activeProcess = undefined
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        this.activeProcess = undefined
        if (code === 0) resolveRun(output)
        else reject(new Error(`${output.trim()}\nOpenOCD 退出码 ${code ?? 'unknown'}`.trim()))
      })
    })
  }

  private addLog(text: string): void {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length === 0) return
    this.snapshot = { ...this.snapshot, logs: [...this.snapshot.logs, ...lines].slice(-120), progress: Math.min(88, this.snapshot.progress + 4), message: classifyProbeMessage(lines.at(-1) ?? this.snapshot.message) }
    this.emitSnapshot('progress')
  }

  private fail(message: string): WchLinkFlashSnapshot {
    this.snapshot = {
      ...this.snapshot,
      state: 'failed',
      progress: this.snapshot.progress || 100,
      message,
      error: message,
      canCancel: false,
      completedAt: new Date().toISOString()
    }
    this.emitSnapshot('failed')
    return this.getSnapshot()
  }

  private emitSnapshot(type: WchLinkFlashEvent['type']): void {
    this.emit('event', { type, snapshot: this.getSnapshot() })
  }

  private makeIdleSnapshot(): WchLinkFlashSnapshot {
    return { state: 'idle', progress: 0, message: '连接 WCH-Link 后，可以先检测烧录器和芯片。', canCancel: false, logs: [] }
  }
}

export function parseWchLinkProbeOutput(output: string): WchLinkProbeInfo {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const openocdVersion = lines.find((line) => line.startsWith('Open On-Chip Debugger'))
  const adapterLine = lines.find((line) => /WCH-Link/i.test(line) && /version/i.test(line))
  const adapterMatch = adapterLine?.match(/WCH-Link(\w*)\s+mode:([^\s]+)\s+version\s+([^\s]+)/i)
  const xlenMatch = output.match(/XLEN=(\d+)/)
  const misaMatch = output.match(/misa=(0x[0-9a-fA-F]+)/)
  const flashBanks = lines.flatMap((line) => {
    const match = line.match(/^#\d+\s*:\s*([^\s]+)\s+\(([^)]+)\)\s+at\s+([^,]+),\s+size\s+([^,]+)/)
    return match ? [{ name: match[1], driver: match[2], base: match[3], size: match[4] }] : []
  })
  return {
    openocdVersion,
    adapterName: adapterMatch ? `WCH-Link${adapterMatch[1]}` : adapterLine?.includes('WCH-Link') ? 'WCH-Link' : undefined,
    adapterMode: adapterMatch?.[2],
    adapterVersion: adapterMatch?.[3],
    targetExamined: /Target successfully examined|Examined RISC-V core/i.test(output),
    xlen: xlenMatch ? Number(xlenMatch[1]) : undefined,
    misa: misaMatch?.[1],
    flashBanks
  }
}

function classifyProbeMessage(line: string): string {
  if (/wlink_init ok/i.test(line)) return 'WCH-Link 已响应，正在识别芯片…'
  if (/Examined RISC-V core/i.test(line)) return '已经识别到 RISC-V 内核。'
  if (/Target successfully examined/i.test(line)) return '芯片识别成功，正在读取 Flash 信息…'
  if (/flash/i.test(line)) return '正在读取 Flash 信息…'
  return '正在读取 WCH-Link 检测输出…'
}

function mapOpenOcdError(caught: unknown): string {
  const text = caught instanceof Error ? caught.message : String(caught)
  if (/OpenOCD 长时间没有响应/.test(text)) return text
  if (/LIBUSB|unable to open|No such file|not found/i.test(text)) return '没有识别到 WCH-Link，请检查 USB 线、驱动和烧录器模式。'
  if (/Target not examined|target.*not.*examined|failed.*examine/i.test(text)) return '烧录器连上了，但没有识别到芯片。请检查目标板供电、GND、SWDIO、SWCLK 和 NRST。'
  if (/wlink|adapter|probe/i.test(text) && !/wlink_init ok/i.test(text)) return '没有识别到 WCH-Link，请检查 USB、驱动和烧录器模式。'
  return text || 'WCH-Link 检测失败，请展开技术日志查看 OpenOCD 输出。'
}
