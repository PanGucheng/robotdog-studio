import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type {
  FirmwareBuildArtifact,
  FirmwareBuildEvent,
  FirmwareBuildSnapshot,
  FirmwareBuildState,
  FirmwareSizeInfo
} from '../../shared/types'
import { ToolchainService } from './toolchain-service'

interface CompileCommandEntry {
  directory: string
  file: string
  command: string
}

export interface FirmwareBuildOptions {
  firmwareRoot?: string
  outputBase?: string
}

type FirmwareBuildServiceEvents = {
  event: [FirmwareBuildEvent]
}

const DEFAULT_FIRMWARE_ROOT = 'D:\\RobotDog\\ch32v203-robot-dog'

export class FirmwareBuildService extends EventEmitter<FirmwareBuildServiceEvents> {
  private readonly toolchain: ToolchainService
  private readonly repoRoot: string
  private activeProcess?: ChildProcessWithoutNullStreams
  private activeSnapshot: FirmwareBuildSnapshot
  private cancelRequested = false

  constructor(toolchain: ToolchainService, repoRoot = process.cwd()) {
    super()
    this.toolchain = toolchain
    this.repoRoot = repoRoot
    this.activeSnapshot = this.makeIdleSnapshot(DEFAULT_FIRMWARE_ROOT)
  }

  getSnapshot(): FirmwareBuildSnapshot {
    return this.cloneSnapshot(this.activeSnapshot)
  }

  async build(options: FirmwareBuildOptions = {}): Promise<FirmwareBuildSnapshot> {
    if (this.activeSnapshot.state === 'running') {
      throw new Error('已有固件构建正在进行')
    }

    this.cancelRequested = false
    const firmwareRoot = resolve(options.firmwareRoot ?? process.env.ROBOTDOG_FIRMWARE_ROOT ?? DEFAULT_FIRMWARE_ROOT)
    const outputBase = resolve(options.outputBase ?? process.env.ROBOTDOG_FIRMWARE_OUT ?? join(this.repoRoot, '.firmware-build', 'ch32v203-robot-dog'))
    const outputDir = options.outputBase ?? process.env.ROBOTDOG_FIRMWARE_OUT
      ? outputBase
      : join(outputBase, new Date().toISOString().replace(/[:.]/g, '-'))

    this.activeSnapshot = {
      id: randomUUID(),
      state: 'running',
      firmwareRoot,
      outputDir,
      completedFiles: 0,
      totalFiles: 0,
      logs: [],
      artifacts: [],
      startedAt: new Date().toISOString()
    }

    this.emitSnapshot('snapshot')
    this.addLog(`固件工程：${firmwareRoot}`)
    this.addLog(`构建输出：${outputDir}`)

    try {
      const toolchainStatus = await this.toolchain.getStatus()
      if (!toolchainStatus.gcc.ok) throw new Error(`GCC 不可用：${toolchainStatus.gcc.detail}`)
      if (!toolchainStatus.objcopy.ok) throw new Error(`objcopy 不可用：${toolchainStatus.objcopy.detail}`)
      if (!toolchainStatus.size.ok) throw new Error(`size 不可用：${toolchainStatus.size.detail}`)

      const compileCommandsPath = join(firmwareRoot, 'build', 'obj', 'compile_commands.json')
      const linkerScript = join(firmwareRoot, 'Ld', 'Link.ld')
      assertFile(compileCommandsPath, 'compile_commands.json')
      assertFile(linkerScript, '链接脚本')

      mkdirSync(join(outputDir, 'obj'), { recursive: true })
      const compileCommands = JSON.parse(readFileSync(compileCommandsPath, 'utf8')) as CompileCommandEntry[]
      this.activeSnapshot.totalFiles = compileCommands.length
      this.emitSnapshot('progress')

      const objectFiles: string[] = []
      for (const [index, entry] of compileCommands.entries()) {
        this.throwIfCancelled()
        const { args, objectPath, sourceFile } = this.prepareCompileArgs(entry, outputDir)
        objectFiles.push(objectPath)
        this.activeSnapshot.currentFile = relative(firmwareRoot, sourceFile)
        this.addLog(`[${index + 1}/${compileCommands.length}] ${this.activeSnapshot.currentFile}`)
        await this.runProcess(toolchainStatus.gcc.path, args)
        this.activeSnapshot.completedFiles = index + 1
        this.emitSnapshot('progress')
      }

      const elfPath = join(outputDir, 'GPIO_Toggle.elf')
      const mapPath = join(outputDir, 'GPIO_Toggle.map')
      const hexPath = join(outputDir, 'GPIO_Toggle.hex')
      const binPath = join(outputDir, 'GPIO_Toggle.bin')

      this.activeSnapshot.currentFile = '链接 GPIO_Toggle.elf'
      this.addLog('链接 GPIO_Toggle.elf')
      await this.runProcess(toolchainStatus.gcc.path, [
        '-march=rv32imac',
        '-mcmodel=medlow',
        '-mabi=ilp32',
        '-nostartfiles',
        '--specs=nano.specs',
        '--specs=nosys.specs',
        '-Wl,-Bstatic',
        '-Wl,--gc-sections',
        `-Wl,-Map=${mapPath}`,
        '-T',
        linkerScript,
        '-o',
        elfPath,
        ...objectFiles
      ])

      this.addLog('生成 HEX 与 BIN')
      await this.runProcess(toolchainStatus.objcopy.path, ['-O', 'ihex', elfPath, hexPath])
      await this.runProcess(toolchainStatus.objcopy.path, ['-O', 'binary', elfPath, binPath])

      this.addLog('读取固件体积')
      const sizeOutput = await this.runProcess(toolchainStatus.size.path, [elfPath])
      this.activeSnapshot.size = parseSizeOutput(sizeOutput)
      this.activeSnapshot.artifacts = [
        makeArtifact('GPIO_Toggle.elf', elfPath, 'elf'),
        makeArtifact('GPIO_Toggle.hex', hexPath, 'hex'),
        makeArtifact('GPIO_Toggle.bin', binPath, 'bin'),
        makeArtifact('GPIO_Toggle.map', mapPath, 'map')
      ]
      this.complete('completed')
      return this.getSnapshot()
    } catch (caught) {
      if (this.cancelRequested) {
        this.complete('cancelled', '构建已取消')
        return this.getSnapshot()
      }

      this.complete('failed', caught instanceof Error ? caught.message : String(caught))
      return this.getSnapshot()
    }
  }

  cancel(): FirmwareBuildSnapshot {
    if (this.activeSnapshot.state !== 'running') return this.getSnapshot()
    this.cancelRequested = true
    this.activeProcess?.kill()
    this.complete('cancelled', '构建已取消')
    return this.getSnapshot()
  }

  private prepareCompileArgs(entry: CompileCommandEntry, outputDir: string): { args: string[]; objectPath: string; sourceFile: string } {
    const originalArgs = splitCommand(entry.command)
    const args = absolutizeProjectPaths(originalArgs.slice(1), entry.directory)
    const sourceFile = normalize(isAbsolute(entry.file) ? entry.file : join(entry.directory, entry.file))

    const outputIndex = args.indexOf('-o')
    if (outputIndex === -1 || outputIndex === args.length - 1) {
      throw new Error(`编译命令缺少 -o 输出：${entry.file}`)
    }

    const objectPath = toObjectPath(args[outputIndex + 1], outputDir)
    mkdirSync(dirname(objectPath), { recursive: true })
    args[outputIndex + 1] = objectPath

    const lastArgIndex = args.length - 1
    if (!isAbsolute(args[lastArgIndex]) || normalize(args[lastArgIndex]) === normalize(entry.file)) {
      args[lastArgIndex] = sourceFile
    }

    return { args, objectPath, sourceFile }
  }

  private runProcess(command: string, args: string[]): Promise<string> {
    return new Promise((resolveRun, reject) => {
      this.throwIfCancelled()
      const child = spawn(command, args, {
        cwd: this.repoRoot,
        windowsHide: true,
        shell: false
      })
      this.activeProcess = child
      let output = ''

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        output += text
        this.addProcessOutput(text)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        output += text
        this.addProcessOutput(text)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        this.activeProcess = undefined
        if (this.cancelRequested) {
          reject(new Error('构建已取消'))
          return
        }
        if (code !== 0) {
          reject(new Error(`命令退出码 ${code ?? 'unknown'}`))
          return
        }
        resolveRun(output)
      })
    })
  }

  private addProcessOutput(text: string): void {
    for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      this.addLog(line, classifyLog(line))
    }
  }

  private addLog(line: string, level: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
    this.activeSnapshot.logs = [...this.activeSnapshot.logs.slice(-199), line]
    this.emit('event', { type: 'log', line, level })
  }

  private complete(state: Exclude<FirmwareBuildState, 'idle' | 'running'>, error?: string): void {
    this.activeSnapshot = {
      ...this.activeSnapshot,
      state,
      error,
      currentFile: undefined,
      completedAt: new Date().toISOString()
    }
    if (state === 'completed') this.addLog('固件编译完成', 'success')
    this.emitSnapshot(state)
  }

  private emitSnapshot(type: FirmwareBuildEvent['type']): void {
    const snapshot = this.getSnapshot()
    if (type === 'completed') this.emit('event', { type: 'completed', snapshot })
    else if (type === 'failed') this.emit('event', { type: 'failed', snapshot })
    else if (type === 'cancelled') this.emit('event', { type: 'cancelled', snapshot })
    else if (type === 'progress') this.emit('event', { type: 'progress', snapshot })
    else this.emit('event', { type: 'snapshot', snapshot })
  }

  private throwIfCancelled(): void {
    if (this.cancelRequested) throw new Error('构建已取消')
  }

  private makeIdleSnapshot(firmwareRoot: string): FirmwareBuildSnapshot {
    return {
      state: 'idle',
      firmwareRoot,
      completedFiles: 0,
      totalFiles: 0,
      logs: [],
      artifacts: []
    }
  }

  private cloneSnapshot(snapshot: FirmwareBuildSnapshot): FirmwareBuildSnapshot {
    return {
      ...snapshot,
      logs: [...snapshot.logs],
      artifacts: [...snapshot.artifacts],
      size: snapshot.size ? { ...snapshot.size } : undefined
    }
  }
}

function assertFile(path: string, label: string): void {
  if (!existsSync(path)) throw new Error(`${label}不存在：${path}`)
}

function splitCommand(command: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: string | null = null

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]
    if ((char === '"' || char === "'") && quote === null) {
      quote = char
      continue
    }
    if (char === quote) {
      quote = null
      continue
    }
    if (/\s/.test(char) && quote === null) {
      if (current.length > 0) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current.length > 0) args.push(current)
  return args
}

function absolutizeProjectPaths(args: string[], firmwareRoot: string): string[] {
  return args.map((arg) => {
    if (arg.startsWith('-I') && arg.length > 2) {
      const includePath = arg.slice(2)
      return isAbsolute(includePath) ? arg : `-I${join(firmwareRoot, includePath)}`
    }
    return arg
  })
}

function toObjectPath(originalOutput: string, outputDir: string): string {
  const normalized = normalize(originalOutput)
  const marker = normalize('build/obj/.obj/')
  const markerIndex = normalized.indexOf(marker)
  const relativeObject = markerIndex >= 0 ? normalized.slice(markerIndex + marker.length) : normalized
  return join(outputDir, 'obj', relativeObject)
}

function parseSizeOutput(output: string): FirmwareSizeInfo | undefined {
  const dataLine = output.split(/\r?\n/).map((line) => line.trim()).find((line) => /^\d+\s+\d+\s+\d+\s+\d+\s+[0-9a-fA-F]+/.test(line))
  if (!dataLine) return undefined
  const [text, data, bss, dec, hex] = dataLine.split(/\s+/)
  return {
    text: Number(text),
    data: Number(data),
    bss: Number(bss),
    dec: Number(dec),
    hex
  }
}

function makeArtifact(name: string, path: string, kind: FirmwareBuildArtifact['kind']): FirmwareBuildArtifact {
  return {
    name,
    path,
    kind,
    bytes: existsSync(path) ? statSync(path).size : undefined
  }
}

function classifyLog(line: string): 'info' | 'warning' | 'error' | 'success' {
  if (/error|错误|failed/i.test(line)) return 'error'
  if (/warning|警告/i.test(line)) return 'warning'
  return 'info'
}
