import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { WchLinkFlashEvent, WchLinkFlashSnapshot, WchLinkProbeInfo } from '../../shared/types'
import { TiMspm0BuildService } from './ti-mspm0-build-service'
import { TiMspm0ToolchainService } from './ti-mspm0-toolchain-service'

type Events = { event: [WchLinkFlashEvent] }
const activeStates = new Set(['probing', 'flashing', 'verifying', 'resetting'])

export class TiMspm0FlashService extends EventEmitter<Events> {
  private process?: ChildProcessWithoutNullStreams
  private snapshot: WchLinkFlashSnapshot = { platform: 'ti-mspm0', state: 'idle', progress: 0, message: '连接 DAPLink / CMSIS-DAP 后，可以检测 MSPM0G3507。', canCancel: false, logs: [] }
  constructor(private readonly toolchain: TiMspm0ToolchainService, private readonly build: TiMspm0BuildService) { super() }
  getSnapshot(): WchLinkFlashSnapshot { return structuredClone(this.snapshot) }

  async probe(): Promise<WchLinkFlashSnapshot> {
    if (activeStates.has(this.snapshot.state)) throw new Error('CMSIS-DAP 操作正在进行，请稍等。')
    if (!existsSync(this.toolchain.getOpenocdPath())) return this.fail('没有找到 MSPM0 专用 OpenOCD。')
    this.snapshot = { platform: 'ti-mspm0', state: 'probing', progress: 10, message: '正在通过 SWD 检测 CMSIS-DAP 和 MSPM0G3507…', canCancel: true, logs: [], startedAt: new Date().toISOString() }
    this.emitEvent('snapshot')
    try {
      const output = await this.openocd(['init', 'halt', 'flash banks', 'exit'])
      const probe = parseProbe(output)
      if (!probe.adapterName) throw new Error('没有发现 CMSIS-DAP / DAPLink。')
      if (!probe.targetExamined) throw new Error('发现了下载器，但 SWD 无法识别 MSPM0。')
      this.snapshot = { ...this.snapshot, state: 'target_ready', progress: 100, message: 'CMSIS-DAP 已连接，MSPM0 识别成功。', canCancel: false, probe, completedAt: new Date().toISOString() }
      this.emitEvent('completed')
      return this.getSnapshot()
    } catch (caught) { return this.fail(mapError(caught)) }
  }

  async flashCurrent(workspaceId: string): Promise<WchLinkFlashSnapshot> {
    if (activeStates.has(this.snapshot.state)) throw new Error('CMSIS-DAP 操作正在进行，请稍等。')
    let artifact
    try { artifact = await this.build.requireCurrentArtifact(workspaceId, 'elf') }
    catch (caught) { return this.fail(caught instanceof Error ? caught.message : String(caught)) }
    this.snapshot = {
      platform: 'ti-mspm0', state: 'probing', progress: 5, message: '烧录前正在检测 CMSIS-DAP 和 MSPM0…', canCancel: true, logs: [], startedAt: new Date().toISOString(),
      artifact: { name: artifact.name, kind: artifact.kind, bytes: artifact.bytes, sha256: artifact.sha256, workspaceId, workspaceCommit: this.build.getSnapshot().proof?.workspaceCommit, firmwareBaselineId: this.build.getSnapshot().proof?.firmwareBaselineId, stale: false }
    }
    this.emitEvent('snapshot')
    try {
      const probeOutput = await this.openocd(['init', 'halt', 'flash banks', 'exit'])
      const probe = parseProbe(probeOutput)
      if (!probe.adapterName) throw new Error('没有发现 CMSIS-DAP / DAPLink。')
      if (!probe.targetExamined) throw new Error('SWD 连接失败，无法识别 MSPM0。')
      this.snapshot = { ...this.snapshot, state: 'flashing', progress: 30, message: `正在写入 ${artifact.name}…`, canCancel: false, probe }
      this.emitEvent('progress')
      await this.openocd(['init', 'halt', `program {${artifact.path.replaceAll('\\', '/')}} verify`, 'reset run', 'exit'], 90_000)
      this.snapshot = { ...this.snapshot, state: 'completed', progress: 100, message: '烧录完成，校验通过，MSPM0 已复位运行。', canCancel: false, completedAt: new Date().toISOString() }
      this.emitEvent('completed')
      return this.getSnapshot()
    } catch (caught) { return this.fail(mapError(caught)) }
  }

  cancel(): WchLinkFlashSnapshot {
    if (this.snapshot.canCancel) { this.process?.kill(); this.snapshot = { ...this.snapshot, state: 'cancelled', message: 'CMSIS-DAP 检测已取消。', canCancel: false, completedAt: new Date().toISOString() }; this.emitEvent('cancelled') }
    return this.getSnapshot()
  }

  private openocd(commands: string[], timeoutMs = 15_000): Promise<string> {
    const args = ['-s', this.toolchain.getOpenocdScriptsPath(), '-f', 'interface/cmsis-dap.cfg', '-c', 'transport select swd', '-c', 'adapter speed 4000', '-f', 'target/ti/mspm0.cfg', ...commands.flatMap((command) => ['-c', command])]
    return new Promise((resolveOutput, reject) => {
      const child = spawn(this.toolchain.getOpenocdPath(), args, { windowsHide: true })
      this.process = child
      let output = ''
      const timeout = setTimeout(() => { child.kill(); reject(new Error('OpenOCD 超时，CMSIS-DAP 可能被占用。')) }, timeoutMs)
      const capture = (chunk: Buffer): void => { const text = chunk.toString(); output += text; const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); if (lines.length) { this.snapshot.logs = [...this.snapshot.logs, ...lines].slice(-200); const all = lines.join(' '); if (/verif/i.test(all)) this.snapshot = { ...this.snapshot, state: 'verifying', progress: 86, message: '正在校验 Flash…' }; else if (/reset/i.test(all) && this.snapshot.state !== 'probing') this.snapshot = { ...this.snapshot, state: 'resetting', progress: 94, message: '校验完成，正在复位 MSPM0…' }; this.emitEvent('progress') } }
      child.stdout.on('data', capture); child.stderr.on('data', capture); child.on('error', (error) => { clearTimeout(timeout); reject(error) }); child.on('close', (code) => { clearTimeout(timeout); this.process = undefined; code === 0 ? resolveOutput(output) : reject(new Error(output.trim() || `OpenOCD 退出码 ${code ?? 'unknown'}`)) })
    })
  }
  private fail(message: string): WchLinkFlashSnapshot { this.snapshot = { ...this.snapshot, platform: 'ti-mspm0', state: 'failed', progress: this.snapshot.progress || 100, message, error: message, canCancel: false, completedAt: new Date().toISOString() }; this.emitEvent('failed'); return this.getSnapshot() }
  private emitEvent(type: WchLinkFlashEvent['type']): void { this.emit('event', { type, snapshot: this.getSnapshot() }) }
}

export function parseProbe(output: string): WchLinkProbeInfo {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const cmsis = lines.find((line) => /CMSIS-DAP|DAPLink/i.test(line))
  return {
    openocdVersion: lines.find((line) => line.startsWith('Open On-Chip Debugger')),
    adapterName: cmsis ? (/DAPLink/i.test(cmsis) ? 'DAPLink / CMSIS-DAP' : 'CMSIS-DAP') : undefined,
    adapterMode: 'SWD', targetExamined: /Cortex-M0|mspm0|target halted|breakpoint/i.test(output) && !/examination failed|target not examined/i.test(output),
    flashBanks: lines.flatMap((line) => { const match = line.match(/^#\d+\s*:\s*([^\s]+)\s+\(([^)]+)\)\s+at\s+([^,]+),\s+size\s+([^,]+)/); return match ? [{ name: match[1], driver: match[2], base: match[3], size: match[4] }] : [] })
  }
}

function mapError(caught: unknown): string { const text = caught instanceof Error ? caught.message : String(caught); if (/unable to find|no device|libusb|cmsis-dap.*not found/i.test(text)) return '没有发现 CMSIS-DAP / DAPLink，请检查 USB 连接和驱动。'; if (/busy|open failed|unable to open/i.test(text)) return 'CMSIS-DAP 正被其他软件占用，请关闭 SysConfig 调试、CCS 或其他 OpenOCD。'; if (/verify/i.test(text)) return 'Flash 写入后的校验失败，请检查供电和 SWD 连线后重试。'; if (/examin|target|swd/i.test(text)) return 'SWD 连接失败，无法识别 MSPM0。请检查供电、GND、SWDIO、SWCLK 和 NRST。'; return text || 'MSPM0 烧录失败。' }
