import { createHash, randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import type {
  FirmwareBuildArtifact,
  FirmwareBuildEvent,
  FirmwareBuildProof,
  FirmwareBuildSnapshot,
  FirmwareBuildState,
  FirmwareSizeInfo
} from '../../shared/types'
import { parseLineConfigText, renderStudentConfigHeader } from './candidate-build-service'
import { FirmwareBaselineService } from './firmware-baseline-service'
import { SourceFingerprintService } from './source-fingerprint-service'
import { ToolchainService } from './toolchain-service'
import { WorkspaceService } from './workspace-service'

export interface FirmwareBuildOptions { workspaceId: string }

export interface FirmwareBuildServiceOptions {
  baseline?: FirmwareBaselineService
  workspaces?: WorkspaceService
  outputBase?: string
}

type FirmwareBuildServiceEvents = { event: [FirmwareBuildEvent] }

const LIVE_BASELINE_SOURCES = [
  'Startup/startup_ch32v20x_D6.S',
  'Core/core_riscv.c',
  'Debug/debug.c',
  'User/main.c',
  'User/system_ch32v20x.c',
  'User/ch32v20x_it.c',
  'User/ccd_line_sensor.c',
  'User/robotdog_types.c',
  'User/robotdog_safety.c',
  'User/robotdog_protocol.c',
  'User/robotdog_text.c',
  'User/robotdog_tx_queue.c',
  'User/robotdog_telemetry.c',
  'User/robotdog_student_bridge.c',
  'User/robotdog_runtime.c',
  'User/robotdog_motion.c',
  'Peripheral/src/ch32v20x_adc.c',
  'Peripheral/src/ch32v20x_dbgmcu.c',
  'Peripheral/src/ch32v20x_gpio.c',
  'Peripheral/src/ch32v20x_misc.c',
  'Peripheral/src/ch32v20x_rcc.c',
  'Peripheral/src/ch32v20x_tim.c',
  'Peripheral/src/ch32v20x_usart.c'
]
const LIVE_INCLUDE_DIRECTORIES = ['Core/Inc', 'Core', 'Debug', 'User', 'Peripheral/inc', 'Startup']
const LIVE_C_FLAGS = ['-Os', '-ffunction-sections', '-fdata-sections', '-fmessage-length=0', '-fsigned-char', '-fno-common', '-DROBOTDOG_ENABLE_LEGACY_TEXT=0']
const LIVE_STUDENT_C_FLAGS = ['-Wall', '-Wextra', '-Wconversion', '-Werror=implicit-function-declaration', '-Werror=return-type']
const LIVE_LINK_FLAGS = ['-nostartfiles', '--specs=nano.specs', '--specs=nosys.specs', '-Wl,--gc-sections']

export class FirmwareBuildService extends EventEmitter<FirmwareBuildServiceEvents> {
  private readonly baseline?: FirmwareBaselineService
  private readonly workspaces?: WorkspaceService
  private readonly outputBase: string
  private readonly fingerprint = new SourceFingerprintService()
  private activeProcess?: ChildProcessWithoutNullStreams
  private activeSnapshot: FirmwareBuildSnapshot = this.makeIdleSnapshot()
  private cancelRequested = false
  private redactions: string[] = []

  constructor(private readonly toolchain: ToolchainService, options: FirmwareBuildServiceOptions = {}) {
    super()
    this.baseline = options.baseline
    this.workspaces = options.workspaces
    this.outputBase = resolve(options.outputBase ?? join(process.cwd(), '.firmware-build', 'managed'))
  }

  async initialize(): Promise<void> {
    await mkdir(this.outputBase, { recursive: true })
    const entries = await readdir(this.outputBase, { withFileTypes: true })
    await Promise.all(entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('.building-')).map((entry) => rm(join(this.outputBase, entry.name), { recursive: true, force: true })))
    const recovered: FirmwareBuildSnapshot[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue
      const snapshot = await this.readCachedBuild(join(this.outputBase, entry.name), entry.name)
      if (snapshot) recovered.push(snapshot)
    }
    recovered.sort((left, right) => (right.completedAt ?? '').localeCompare(left.completedAt ?? ''))
    if (recovered[0]) {
      const status = await this.baseline?.getStatus().catch(() => undefined)
      this.activeSnapshot = { ...recovered[0], firmwareRoot: status?.sourceRoot ?? '', logs: ['已恢复上次经过哈希校验的固件产物。'] }
    }
  }

  getSnapshot(): FirmwareBuildSnapshot { return structuredClone(this.activeSnapshot) }

  async requireCurrentArtifact(workspaceId: string, kind: FirmwareBuildArtifact['kind']): Promise<FirmwareBuildArtifact> {
    if (!this.workspaces || this.activeSnapshot.state !== 'completed' || !this.activeSnapshot.proof) throw new Error('请先为当前学生对话生成完整固件。')
    const workspace = await this.workspaces.get(workspaceId)
    const proof = this.activeSnapshot.proof
    if (proof.workspaceId !== workspace.id || proof.workspaceCommit !== workspace.headCommit || proof.firmwareBaselineId !== workspace.firmwareBaselineId || proof.baselineCommit !== workspace.baselineCommit) {
      throw new Error('学生代码或固件基线已经变化，请重新生成完整固件。')
    }
    const artifact = this.activeSnapshot.artifacts.find((item) => item.kind === kind)
    if (!artifact) throw new Error(`完整固件中缺少 ${kind.toUpperCase()} 产物。`)
    const actual = createHash('sha256').update(await readFile(artifact.path)).digest('hex')
    if (!artifact.sha256 || actual !== artifact.sha256) throw new Error('固件产物校验失败，请重新生成。')
    return structuredClone(artifact)
  }

  async build(options: FirmwareBuildOptions): Promise<FirmwareBuildSnapshot> {
    if (this.activeSnapshot.state === 'running') throw new Error('已有固件构建正在进行')
    if (!this.baseline || !this.workspaces) throw new Error('完整固件构建服务尚未绑定学生工作区和固件基线')
    if (!/^ws_[a-f0-9]{24}$/.test(options.workspaceId)) throw new Error('WORKSPACE_ID_INVALID')

    this.cancelRequested = false
    const buildId = randomUUID()
    const temporaryRoot = join(this.outputBase, `.building-${buildId}`)
    let publishedRoot: string | undefined
    try {
      const [{ manifest, sourceRoot, sourceHash }, workspace, toolchain] = await Promise.all([
        this.baseline.requireTestingBaseline(), this.workspaces.get(options.workspaceId), this.toolchain.getStatus()
      ])
      if (!toolchain.gcc.ok || !toolchain.objcopy.ok || !toolchain.size.ok) throw new Error('内置 WCH GCC12 工具链不完整')
      if (workspace.firmwareBaselineId !== manifest.id || workspace.baselineCommit !== manifest.source.expectedCommit) throw new Error('工作区绑定的固件基线与当前基线不一致')
      const projectRoot = await this.workspaces.getProjectRootForMain(workspace.id)
      if (manifest.schemaVersion === 2) {
        return await this.buildCmakeBaseline({ buildId, temporaryRoot, sourceRoot, sourceHash, manifest, workspace, projectRoot, toolchain })
      }
      const workspaceSourceHash = await this.fingerprint.calculate(projectRoot)
      const inputHash = createHash('sha256').update(JSON.stringify({
        workspaceCommit: workspace.headCommit, workspaceSourceHash, baselineId: manifest.id,
        baselineCommit: manifest.source.expectedCommit, baselineSourceHash: sourceHash,
        toolchain: toolchain.gcc.version ?? toolchain.gcc.detail, profile: manifest.toolchain
      })).digest('hex')
      publishedRoot = join(this.outputBase, inputHash)
      this.redactions = [sourceRoot, projectRoot, temporaryRoot, this.outputBase]
      this.activeSnapshot = {
        id: buildId, workspaceId: workspace.id, state: 'running', firmwareRoot: sourceRoot, outputDir: publishedRoot,
        completedFiles: 0, totalFiles: manifest.build.sources.length + 1, logs: [], artifacts: [], startedAt: new Date().toISOString()
      }
      this.emitSnapshot('snapshot')
      this.addLog(`正在准备 ${manifest.label}`)

      const cached = await this.readCachedBuild(publishedRoot, inputHash)
      if (cached) {
        this.activeSnapshot = { ...cached, id: buildId, firmwareRoot: sourceRoot, logs: ['输入没有变化，已使用经过哈希校验的固件产物。'] }
        this.emitSnapshot('completed')
        return this.getSnapshot()
      }

      const stagingRoot = join(temporaryRoot, 'source')
      const outputRoot = join(temporaryRoot, 'output')
      await mkdir(this.outputBase, { recursive: true })
      await this.copyBaseline(sourceRoot, stagingRoot)
      await this.applyStudentOverlay(projectRoot, stagingRoot, manifest.studentOverlay)
      await mkdir(join(outputRoot, 'obj'), { recursive: true })

      const sources = [...manifest.build.sources, manifest.studentOverlay.source]
      const objectFiles: string[] = []
      for (const [index, source] of sources.entries()) {
        this.throwIfCancelled()
        const sourcePath = join(stagingRoot, ...source.split('/'))
        const objectPath = join(outputRoot, 'obj', `${source.replaceAll(/[\\/]/g, '__').replace(/\.[^.]+$/, '')}.o`)
        await mkdir(dirname(objectPath), { recursive: true })
        const includeArgs = manifest.build.includeDirectories.flatMap((path) => ['-I', join(stagingRoot, ...path.split('/'))])
        const targetArgs = [`-march=${manifest.toolchain.arch}`, `-mabi=${manifest.toolchain.abi}`, `-mcmodel=${manifest.toolchain.codeModel}`]
        const isAssembly = extname(source).toLowerCase() === '.s'
        const args = isAssembly
          ? ['-c', '-x', 'assembler-with-cpp', ...includeArgs, ...targetArgs, ...manifest.build.assemblerFlags, sourcePath, '-o', objectPath]
          : ['-c', '-x', 'c', ...includeArgs, ...targetArgs, ...manifest.build.cFlags, sourcePath, '-o', objectPath]
        this.activeSnapshot.currentFile = source
        this.addLog(`[${index + 1}/${sources.length}] ${source}`)
        await this.runProcess(toolchain.gcc.path, args, stagingRoot)
        objectFiles.push(objectPath)
        this.activeSnapshot.completedFiles = index + 1
        this.emitSnapshot('progress')
      }

      const elfPath = join(outputRoot, manifest.artifacts.elf)
      const hexPath = join(outputRoot, manifest.artifacts.hex)
      const binPath = join(outputRoot, manifest.artifacts.bin)
      const mapPath = join(outputRoot, manifest.artifacts.map)
      this.activeSnapshot.currentFile = `链接 ${manifest.artifacts.elf}`
      await this.runProcess(toolchain.gcc.path, [
        `-march=${manifest.toolchain.arch}`, `-mabi=${manifest.toolchain.abi}`, `-mcmodel=${manifest.toolchain.codeModel}`,
        ...manifest.build.linkFlags, `-Wl,-Map=${mapPath}`, '-T', join(stagingRoot, ...manifest.target.linkerScript.split('/')),
        '-o', elfPath, ...objectFiles
      ], stagingRoot)
      await this.runProcess(toolchain.objcopy.path, ['-O', 'ihex', elfPath, hexPath], stagingRoot)
      await this.runProcess(toolchain.objcopy.path, ['-O', 'binary', elfPath, binPath], stagingRoot)
      const sizeOutput = await this.runProcess(toolchain.size.path, [elfPath], stagingRoot)
      const size = parseSizeOutput(sizeOutput)
      if (!size) throw new Error('无法读取固件 Flash/RAM 占用')
      if (size.text + size.data > manifest.target.memory.flashBytes) throw new Error('固件超过临时基线声明的 Flash 容量')
      if (size.data + size.bss > manifest.target.memory.ramBytes) throw new Error('固件超过临时基线声明的 RAM 容量')

      const artifacts = await Promise.all([
        makeArtifact(manifest.artifacts.elf, elfPath, 'elf'), makeArtifact(manifest.artifacts.hex, hexPath, 'hex'),
        makeArtifact(manifest.artifacts.bin, binPath, 'bin'), makeArtifact(manifest.artifacts.map, mapPath, 'map')
      ])
      const completedAt = new Date().toISOString()
      const proof: FirmwareBuildProof = {
        schemaVersion: 1, inputHash, workspaceId: workspace.id, workspaceCommit: workspace.headCommit, workspaceSourceHash,
        firmwareBaselineId: manifest.id, baselineCommit: manifest.source.expectedCommit, baselineSourceHash: sourceHash,
        toolchain: toolchain.gcc.version ?? toolchain.gcc.detail, board: manifest.target.board, size,
        artifacts: artifacts.map(({ name, kind, bytes, sha256 }) => ({ name, kind, bytes: bytes ?? 0, sha256: sha256! })),
        startedAt: this.activeSnapshot.startedAt!, completedAt, releaseEligible: manifest.releaseEligible
      }
      await writeFile(join(outputRoot, 'build-proof.json'), `${JSON.stringify(proof, null, 2)}\n`, 'utf8')
      await rm(publishedRoot, { recursive: true, force: true })
      await rename(outputRoot, publishedRoot)
      await rm(temporaryRoot, { recursive: true, force: true })
      const publishedArtifacts = artifacts.map((artifact) => ({ ...artifact, path: join(publishedRoot!, artifact.name) }))
      this.activeSnapshot = { ...this.activeSnapshot, state: 'completed', currentFile: undefined, outputDir: publishedRoot, artifacts: publishedArtifacts, size, proof, completedAt }
      this.addLog('完整固件已生成并完成哈希校验', 'success')
      this.emitSnapshot('completed')
      return this.getSnapshot()
    } catch (caught) {
      await rm(temporaryRoot, { recursive: true, force: true }).catch(() => undefined)
      if (this.cancelRequested) this.complete('cancelled', '构建已安全取消')
      else this.complete('failed', this.redact(caught instanceof Error ? caught.message : String(caught)))
      return this.getSnapshot()
    }
  }

  cancel(): FirmwareBuildSnapshot {
    if (this.activeSnapshot.state !== 'running') return this.getSnapshot()
    this.cancelRequested = true
    this.activeProcess?.kill()
    return this.getSnapshot()
  }

  private async buildCmakeBaseline(context: {
    buildId: string
    temporaryRoot: string
    sourceRoot: string
    sourceHash: string
    manifest: Extract<Awaited<ReturnType<FirmwareBaselineService['getManifest']>>, { schemaVersion: 2 }>
    workspace: Awaited<ReturnType<WorkspaceService['get']>>
    projectRoot: string
    toolchain: Awaited<ReturnType<ToolchainService['getStatus']>>
  }): Promise<FirmwareBuildSnapshot> {
    const { buildId, temporaryRoot, sourceRoot, sourceHash, manifest, workspace, projectRoot, toolchain } = context
    const workspaceSourceHash = await this.fingerprint.calculate(projectRoot)
    const inputHash = createHash('sha256').update(JSON.stringify({
      workspaceCommit: workspace.headCommit, workspaceSourceHash, baselineId: manifest.id,
      baselineCommit: manifest.source.expectedCommit, baselineSourceHash: sourceHash,
      toolchain: toolchain.gcc.version ?? toolchain.gcc.detail, build: manifest.build, live: manifest.live
    })).digest('hex')
    const publishedRoot = join(this.outputBase, inputHash)
    this.redactions = [sourceRoot, projectRoot, temporaryRoot, this.outputBase]
    this.activeSnapshot = {
      id: buildId, workspaceId: workspace.id, state: 'running', firmwareRoot: sourceRoot, outputDir: publishedRoot,
      completedFiles: 0, totalFiles: 2, logs: [], artifacts: [], startedAt: new Date().toISOString()
    }
    this.emitSnapshot('snapshot')
    this.addLog(`正在使用内置 WCH GCC 构建 ${manifest.label}`)

    const cached = await this.readCachedBuild(publishedRoot, inputHash)
    if (cached) {
      this.activeSnapshot = { ...cached, id: buildId, firmwareRoot: sourceRoot, logs: ['输入没有变化，已使用经过哈希校验的 CMake 固件产物。'] }
      this.emitSnapshot('completed')
      return this.getSnapshot()
    }

    const stagingRoot = join(temporaryRoot, 'source')
    const outputRoot = join(temporaryRoot, 'output')
    await mkdir(outputRoot, { recursive: true })
    await mkdir(join(outputRoot, 'obj'), { recursive: true })
    await this.copyBaseline(sourceRoot, stagingRoot)
    await this.applyStudentOverlay(projectRoot, stagingRoot, manifest.studentOverlay)

    const sources = [...LIVE_BASELINE_SOURCES, manifest.studentOverlay.source]
    this.activeSnapshot.totalFiles = sources.length + 1
    const objectFiles: string[] = []
    for (const [index, source] of sources.entries()) {
      this.throwIfCancelled()
      const sourcePath = join(stagingRoot, ...source.split('/'))
      const objectPath = join(outputRoot, 'obj', `${source.replaceAll(/[\\/]/g, '__').replace(/\.[^.]+$/, '')}.o`)
      await mkdir(dirname(objectPath), { recursive: true })
      const includeArgs = LIVE_INCLUDE_DIRECTORIES.flatMap((path) => ['-I', join(stagingRoot, ...path.split('/'))])
      const targetArgs = [`-march=${manifest.toolchain.arch}`, `-mabi=${manifest.toolchain.abi}`, `-mcmodel=${manifest.toolchain.codeModel}`]
      const isAssembly = extname(source).toLowerCase() === '.s'
      const extraFlags = source === manifest.studentOverlay.source ? LIVE_STUDENT_C_FLAGS : []
      const args = isAssembly
        ? ['-c', '-x', 'assembler-with-cpp', ...includeArgs, ...targetArgs, sourcePath, '-o', objectPath]
        : ['-c', '-x', 'c', ...includeArgs, ...targetArgs, ...LIVE_C_FLAGS, ...extraFlags, sourcePath, '-o', objectPath]
      this.activeSnapshot.currentFile = source
      this.addLog(`[${index + 1}/${sources.length}] ${source}`)
      await this.runProcess(toolchain.gcc.path, args, stagingRoot)
      objectFiles.push(objectPath)
      this.activeSnapshot.completedFiles = index + 1
      this.emitSnapshot('progress')
    }

    const elfPath = join(outputRoot, manifest.artifacts.elf)
    const hexPath = join(outputRoot, manifest.artifacts.hex)
    const binPath = join(outputRoot, manifest.artifacts.bin)
    const mapPath = join(outputRoot, manifest.artifacts.map)
    this.activeSnapshot.currentFile = `链接 ${manifest.artifacts.elf}`
    const targetArgs = [`-march=${manifest.toolchain.arch}`, `-mabi=${manifest.toolchain.abi}`, `-mcmodel=${manifest.toolchain.codeModel}`]
    await this.runProcess(toolchain.gcc.path, [
      ...targetArgs, ...LIVE_LINK_FLAGS, `-Wl,-Map=${mapPath}`, '-T', join(stagingRoot, ...manifest.target.linkerScript.split('/')),
      '-o', elfPath, ...objectFiles
    ], stagingRoot)
    await this.runProcess(toolchain.objcopy.path, ['-O', 'ihex', elfPath, hexPath], stagingRoot)
    await this.runProcess(toolchain.objcopy.path, ['-O', 'binary', elfPath, binPath], stagingRoot)
    const sizeOutput = await this.runProcess(toolchain.size.path, [elfPath], stagingRoot)
    await writeFile(join(outputRoot, manifest.artifacts.size), sizeOutput, 'utf8')
    const size = parseSizeOutput(sizeOutput)
    if (!size) throw new Error('无法读取固件 Flash/RAM 占用')
    if (size.text + size.data > manifest.target.memory.flashBytes) throw new Error('固件超过临时基线声明的 Flash 容量')
    if (size.data + size.bss > manifest.target.memory.ramBytes) throw new Error('固件超过临时基线声明的 RAM 容量')
    const artifacts = await Promise.all([
      makeArtifact(manifest.artifacts.elf, elfPath, 'elf'),
      makeArtifact(manifest.artifacts.hex, hexPath, 'hex'),
      makeArtifact(manifest.artifacts.bin, binPath, 'bin'),
      makeArtifact(manifest.artifacts.map, mapPath, 'map')
    ])
    const completedAt = new Date().toISOString()
    const proof: FirmwareBuildProof = {
      schemaVersion: 1, inputHash, workspaceId: workspace.id, workspaceCommit: workspace.headCommit, workspaceSourceHash,
      firmwareBaselineId: manifest.id, baselineCommit: manifest.source.expectedCommit, baselineSourceHash: sourceHash,
      toolchain: toolchain.gcc.version ?? toolchain.gcc.detail, board: manifest.target.board, size,
      artifacts: artifacts.map(({ name, kind, bytes, sha256 }) => ({ name, kind, bytes: bytes ?? 0, sha256: sha256! })),
      startedAt: this.activeSnapshot.startedAt!, completedAt, releaseEligible: manifest.releaseEligible
    }
    await writeFile(join(outputRoot, 'build-proof.json'), `${JSON.stringify(proof, null, 2)}\n`, 'utf8')
    await rm(publishedRoot, { recursive: true, force: true })
    await rename(outputRoot, publishedRoot)
    await rm(temporaryRoot, { recursive: true, force: true })
    const publishedArtifacts = artifacts.map((artifact) => ({ ...artifact, path: join(publishedRoot, artifact.name) }))
    this.activeSnapshot = { ...this.activeSnapshot, state: 'completed', currentFile: undefined, outputDir: publishedRoot, artifacts: publishedArtifacts, size, proof, completedAt }
    this.addLog('完整固件已通过内置 WCH GCC 生成并完成哈希校验', 'success')
    this.emitSnapshot('completed')
    return this.getSnapshot()
  }

  private async copyBaseline(sourceRoot: string, stagingRoot: string): Promise<void> {
    const ignored = new Set(['.git', 'build', '.eide', '.mrs', '.vscode'])
    await cp(sourceRoot, stagingRoot, {
      recursive: true, verbatimSymlinks: true,
      filter: (source) => !relative(sourceRoot, source).split(/[\\/]/).some((part) => ignored.has(part))
    })
  }

  private async applyStudentOverlay(projectRoot: string, stagingRoot: string, overlay: { source: string; header: string; configInput: string; generatedHeader: string }): Promise<void> {
    for (const path of [overlay.source, overlay.header]) {
      const target = join(stagingRoot, ...path.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await copyFile(join(projectRoot, ...path.split('/')), target)
    }
    const config = parseLineConfigText(await readFile(join(projectRoot, ...overlay.configInput.split('/')), 'utf8'))
    const generatedPath = join(stagingRoot, ...overlay.generatedHeader.split('/'))
    await mkdir(dirname(generatedPath), { recursive: true })
    await writeFile(generatedPath, renderStudentConfigHeader(config), 'utf8')
  }

  private async readCachedBuild(root: string, inputHash: string): Promise<FirmwareBuildSnapshot | undefined> {
    try {
      const proof = JSON.parse(await readFile(join(root, 'build-proof.json'), 'utf8')) as FirmwareBuildProof
      if (proof.inputHash !== inputHash) return undefined
      const artifacts = await Promise.all(proof.artifacts.map(async (item) => {
        const artifact = await makeArtifact(item.name, join(root, item.name), item.kind)
        if (artifact.sha256 !== item.sha256) throw new Error('缓存产物哈希不匹配')
        return artifact
      }))
      return {
        workspaceId: proof.workspaceId, state: 'completed', firmwareRoot: '', outputDir: root,
        completedFiles: this.activeSnapshot.totalFiles, totalFiles: this.activeSnapshot.totalFiles, logs: [], artifacts,
        size: proof.size, proof, startedAt: proof.startedAt, completedAt: proof.completedAt
      }
    } catch { return undefined }
  }

  private runProcess(command: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolveRun, reject) => {
      this.throwIfCancelled()
      const child = spawn(command, args, { cwd, windowsHide: true, shell: false, env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' } })
      this.activeProcess = child
      let output = ''
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); this.addProcessOutput(chunk.toString('utf8')) })
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString('utf8'); this.addProcessOutput(chunk.toString('utf8')) })
      child.on('error', reject)
      child.on('close', (code) => {
        this.activeProcess = undefined
        if (this.cancelRequested) reject(new Error('构建已取消'))
        else if (code !== 0) reject(new Error(`构建命令退出码 ${code ?? 'unknown'}`))
        else resolveRun(output)
      })
    })
  }

  private addProcessOutput(text: string): void {
    for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) this.addLog(this.redact(line), classifyLog(line))
  }

  private addLog(line: string, level: 'info' | 'warning' | 'error' | 'success' = 'info'): void {
    this.activeSnapshot.logs = [...this.activeSnapshot.logs.slice(-199), line]
    this.emit('event', { type: 'log', line, level })
  }

  private complete(state: Exclude<FirmwareBuildState, 'idle' | 'running'>, error?: string): void {
    this.activeSnapshot = { ...this.activeSnapshot, state, error, currentFile: undefined, completedAt: new Date().toISOString() }
    this.emitSnapshot(state)
  }

  private emitSnapshot(type: FirmwareBuildEvent['type']): void {
    const snapshot = this.getSnapshot()
    if (type === 'snapshot') this.emit('event', { type, snapshot })
    else if (type === 'progress') this.emit('event', { type, snapshot })
    else if (type === 'completed') this.emit('event', { type, snapshot })
    else if (type === 'failed') this.emit('event', { type, snapshot })
    else if (type === 'cancelled') this.emit('event', { type, snapshot })
  }

  private throwIfCancelled(): void { if (this.cancelRequested) throw new Error('构建已取消') }
  private redact(text: string): string { return this.redactions.reduce((value, path) => value.replaceAll(path, '[受保护路径]').replaceAll(path.replaceAll('\\', '/'), '[受保护路径]'), text) }
  private makeIdleSnapshot(): FirmwareBuildSnapshot { return { state: 'idle', firmwareRoot: '', completedFiles: 0, totalFiles: 0, logs: [], artifacts: [] } }
}

export function parseSizeOutput(output: string): FirmwareSizeInfo | undefined {
  const dataLine = output.split(/\r?\n/).map((line) => line.trim()).find((line) => /^\d+\s+\d+\s+\d+\s+\d+\s+[0-9a-fA-F]+/.test(line))
  if (!dataLine) return undefined
  const [text, data, bss, dec, hex] = dataLine.split(/\s+/)
  return { text: Number(text), data: Number(data), bss: Number(bss), dec: Number(dec), hex }
}

async function parseSizeFile(path: string): Promise<FirmwareSizeInfo | undefined> {
  const text = await readFile(path, 'utf8')
  const table = parseSizeOutput(text)
  if (table) return table
  const values = Object.fromEntries([...text.matchAll(/^([a-z_]+)=([0-9A-Za-z]+)$/gm)].map((match) => [match[1], match[2]]))
  const flashUsed = Number(values.flash_used_bytes)
  const ramUsed = Number(values.ram_used_bytes)
  if (!Number.isFinite(flashUsed) || !Number.isFinite(ramUsed)) return undefined
  return {
    text: flashUsed,
    data: 0,
    bss: ramUsed,
    dec: flashUsed + ramUsed,
    hex: (flashUsed + ramUsed).toString(16)
  }
}

async function makeArtifact(name: string, path: string, kind: FirmwareBuildArtifact['kind']): Promise<FirmwareBuildArtifact> {
  const bytes = (await stat(path)).size
  const sha256 = createHash('sha256').update(await readFile(path)).digest('hex')
  return { name, path, kind, bytes, sha256 }
}

function classifyLog(line: string): 'info' | 'warning' | 'error' | 'success' {
  if (/error|错误|failed/i.test(line)) return 'error'
  if (/warning|警告/i.test(line)) return 'warning'
  return 'info'
}
