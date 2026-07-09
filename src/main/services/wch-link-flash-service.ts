import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { WchLinkFlashEvent, WchLinkFlashSnapshot, WchLinkProbeInfo } from '../../shared/types'
import { FirmwareBuildService } from './firmware-build-service'
import { ToolchainService } from './toolchain-service'

type WchLinkFlashServiceEvents = { event: [WchLinkFlashEvent] }

const ACTIVE_STATES = new Set(['probing', 'flashing', 'verifying', 'resetting'])

export class WchLinkFlashService extends EventEmitter<WchLinkFlashServiceEvents> {
  private activeProcess?: ChildProcessWithoutNullStreams
  private snapshot: WchLinkFlashSnapshot = this.makeIdleSnapshot()

  constructor(private readonly toolchain: ToolchainService, private readonly firmware?: FirmwareBuildService, private readonly timeoutMs = 12_000) {
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

  async flashCurrent(workspaceId: string): Promise<WchLinkFlashSnapshot> {
    if (ACTIVE_STATES.has(this.snapshot.state)) throw new Error('WCH-Link 操作正在进行，请稍等。')
    if (!this.firmware) return this.fail('WCH-Link 烧录服务尚未绑定完整固件构建服务。')
    const openocd = this.toolchain.getOpenocdPath()
    const config = this.toolchain.getOpenocdRiscvConfigPath()
    if (!existsSync(openocd)) return this.fail(`没有找到内置 WCH OpenOCD：${openocd}`)
    if (!existsSync(config)) return this.fail(`没有找到 WCH RISC-V OpenOCD 配置：${config}`)

    let artifact
    try {
      artifact = await this.firmware.requireCurrentArtifact(workspaceId, 'hex')
    } catch (caught) {
      return this.fail(caught instanceof Error ? caught.message : String(caught))
    }

    this.snapshot = {
      state: 'probing',
      progress: 6,
      message: '烧录前正在重新检测 WCH-Link 和芯片…',
      canCancel: true,
      artifact: {
        name: artifact.name,
        kind: artifact.kind,
        bytes: artifact.bytes,
        sha256: artifact.sha256,
        workspaceId,
        workspaceCommit: this.firmware.getSnapshot().proof?.workspaceCommit,
        firmwareBaselineId: this.firmware.getSnapshot().proof?.firmwareBaselineId,
        stale: false
      },
      logs: [],
      startedAt: new Date().toISOString()
    }
    this.emitSnapshot('snapshot')

    try {
      const probeOutput = await this.runOpenocd(openocd, ['-f', config, '-c', 'init', '-c', 'halt', '-c', 'flash banks', '-c', 'exit'])
      const probe = parseWchLinkProbeOutput(probeOutput)
      if (!probe.adapterName) throw new Error('没有识别到 WCH-Link，请检查 USB、驱动和烧录器模式。')
      if (!probe.targetExamined) throw new Error('烧录器已连接，但没有识别到芯片。请检查目标板供电、GND、SWDIO、SWCLK 和 NRST。')
      this.snapshot = {
        ...this.snapshot,
        state: 'flashing',
        progress: 30,
        message: `正在写入 ${artifact.name}，请不要断电或拔线…`,
        canCancel: false,
        probe
      }
      this.emitSnapshot('progress')
      await this.runOpenocd(openocd, ['-f', config, '-c', 'init', '-c', 'halt', '-c', makeOpenOcdProgramCommand(artifact.path)], 90_000)
      this.snapshot = {
        ...this.snapshot,
        state: 'completed',
        progress: 100,
        message: '写入完成，OpenOCD 校验通过并已复位目标板。',
        canCancel: false,
        completedAt: new Date().toISOString()
      }
      this.emitSnapshot('completed')
      return this.getSnapshot()
    } catch (caught) {
      return this.fail(mapOpenOcdError(caught))
    }
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

  private runOpenocd(command: string, args: string[], timeoutMs = this.timeoutMs): Promise<string> {
    return new Promise((resolveRun, reject) => {
      const child = spawn(command, args, { windowsHide: true, shell: false, env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' } })
      this.activeProcess = child
      let output = ''
      const timeout = setTimeout(() => {
        child.kill()
        reject(new Error('OpenOCD 长时间没有响应。请断开重连 WCH-Link 和目标板后重试。'))
      }, timeoutMs)
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
    const currentState = this.snapshot.state
    const lastLine = lines.at(-1) ?? this.snapshot.message
    const nextState = classifyOpenOcdState(lastLine, currentState)
    this.snapshot = {
      ...this.snapshot,
      state: nextState,
      logs: [...this.snapshot.logs, ...lines].slice(-160),
      progress: Math.min(nextState === 'verifying' ? 88 : nextState === 'resetting' ? 94 : 82, this.snapshot.progress + 4),
      message: classifyOpenOcdMessage(lastLine, nextState)
    }
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

export function makeOpenOcdProgramCommand(path: string): string {
  if (/[\r\n}]/.test(path)) throw new Error('固件路径包含 OpenOCD 不支持的字符')
  return `program {${path.replaceAll('\\', '/')}} verify reset exit`
}

function classifyOpenOcdMessage(line: string, state: WchLinkFlashSnapshot['state']): string {
  if (state === 'flashing') return '正在写入当前程序，请不要断电或拔线…'
  if (state === 'verifying') return '正在校验写入结果…'
  if (state === 'resetting') return '校验完成，正在复位目标板…'
  if (/wlink_init ok/i.test(line)) return 'WCH-Link 已响应，正在识别芯片…'
  if (/Examined RISC-V core/i.test(line)) return '已经识别到 RISC-V 内核。'
  if (/Target successfully examined/i.test(line)) return '芯片识别成功，正在读取 Flash 信息…'
  if (/flash/i.test(line)) return '正在读取 Flash 信息…'
  return '正在读取 WCH-Link 检测输出…'
}

function classifyOpenOcdState(line: string, current: WchLinkFlashSnapshot['state']): WchLinkFlashSnapshot['state'] {
  if (!['flashing', 'verifying', 'resetting'].includes(current)) return current
  if (/reset|shutdown command invoked/i.test(line)) return 'resetting'
  if (/verif|checksum|crc/i.test(line)) return 'verifying'
  if (/writ|program|erase|flash/i.test(line)) return 'flashing'
  return current
}

function mapOpenOcdError(caught: unknown): string {
  const text = caught instanceof Error ? caught.message : String(caught)
  if (/OpenOCD 长时间没有响应/.test(text)) return text
  if (/verify|checksum|crc/i.test(text)) return '写入后校验失败。请不要继续比赛，重新检测烧录器和目标板后再次烧录。'
  if (/LIBUSB|unable to open|No such file|not found/i.test(text)) return '没有识别到 WCH-Link，请检查 USB 线、驱动和烧录器模式。'
  if (/Target not examined|target.*not.*examined|failed.*examine/i.test(text)) return '烧录器连上了，但没有识别到芯片。请检查目标板供电、GND、SWDIO、SWCLK 和 NRST。'
  if (/wlink|adapter|probe/i.test(text) && !/wlink_init ok/i.test(text)) return '没有识别到 WCH-Link，请检查 USB、驱动和烧录器模式。'
  return text || 'WCH-Link 检测失败，请展开技术日志查看 OpenOCD 输出。'
}
