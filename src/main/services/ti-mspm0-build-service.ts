import { createHash, randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { FirmwareBuildArtifact, FirmwareBuildEvent, FirmwareBuildProof, FirmwareBuildSnapshot, FirmwareSizeInfo } from '../../shared/types'
import { parseCompilerDiagnostics } from './candidate-build-service'
import { SourceFingerprintService } from './source-fingerprint-service'
import { TiMspm0ToolchainService } from './ti-mspm0-toolchain-service'
import { prepareSysconfigLaunch } from './ti-sysconfig-launcher'
import { WorkspaceService } from './workspace-service'
import type { FirmwareBaselineResolver } from './firmware-baseline-resolver'

type Events = { event: [FirmwareBuildEvent] }

export class TiMspm0BuildService extends EventEmitter<Events> {
  private snapshot: FirmwareBuildSnapshot = idle()
  private active?: ChildProcessWithoutNullStreams
  private cancelled = false
  private readonly fingerprint = new SourceFingerprintService()

  constructor(private readonly toolchain: TiMspm0ToolchainService, private readonly workspaces: WorkspaceService, private readonly outputBase: string,
    private readonly baselines?: FirmwareBaselineResolver) { super() }

  async initialize(): Promise<void> { await mkdir(this.outputBase, { recursive: true }) }
  getSnapshot(): FirmwareBuildSnapshot { return structuredClone(this.snapshot) }

  async requireCurrentArtifact(workspaceId: string, kind: FirmwareBuildArtifact['kind']): Promise<FirmwareBuildArtifact> {
    const workspace = await this.workspaces.get(workspaceId)
    if (workspace.platform !== 'ti-mspm0' || this.snapshot.state !== 'completed' || !this.snapshot.proof) throw new Error('请先编译当前 TI MSPM0 工程。')
    if (this.snapshot.proof.workspaceId !== workspaceId || this.snapshot.proof.workspaceCommit !== workspace.headCommit) throw new Error('学生代码已经变化，请重新编译后再烧录。')
    const projectRoot = await this.workspaces.getProjectRootForMain(workspaceId)
    if (await this.fingerprint.calculate(projectRoot) !== this.snapshot.proof.workspaceSourceHash) throw new Error('代码或 SysConfig 配置已经变化，请重新编译后再烧录。')
    const artifact = this.snapshot.artifacts.find((item) => item.kind === kind)
    if (!artifact) throw new Error(`构建产物中缺少 ${kind.toUpperCase()} 文件。`)
    const sha256 = createHash('sha256').update(await readFile(artifact.path)).digest('hex')
    if (sha256 !== artifact.sha256) throw new Error('构建产物哈希校验失败，请重新编译。')
    return structuredClone(artifact)
  }

  async build({ workspaceId }: { workspaceId: string }): Promise<FirmwareBuildSnapshot> {
    if (this.snapshot.state === 'running') throw new Error('已有构建正在进行')
    const workspace = await this.workspaces.get(workspaceId)
    if (workspace.platform !== 'ti-mspm0' || workspace.target !== 'MSPM0G3507') throw new Error('TI MSPM0 工具链拒绝编译非 MSPM0G3507 工程。')
    const projectRoot = await this.workspaces.getProjectRootForMain(workspaceId)
    const tools = await this.toolchain.getStatus()
    if (!tools.gcc.ok || !tools.objcopy.ok || !tools.size.ok || !tools.sysconfig?.ok || !tools.sdk?.ok) throw new Error('TI MSPM0 固定工具链不完整，请在设置中检查 SDK、SysConfig 和 Arm GCC。')
    const id = randomUUID()
    const outputDir = resolve(this.outputBase, workspaceId)
    const syscfgName = workspace.templateId === 'ti-mspm0g3507-pony' || workspace.templateId === 'ti-mspm0g3507-sdk-empty' ? 'board.syscfg' : 'gpio_toggle_output.syscfg'
    const pony = workspace.templateId === 'ti-mspm0g3507-pony'
    const artifactName = pony ? 'RobotDog' : workspace.templateId === 'ti-mspm0g3507-sdk-empty' ? 'mspm0-empty' : 'gpio_toggle_output'
    const generatedDir = join(projectRoot, 'generated')
    const objectDir = join(outputDir, 'obj')
    this.cancelled = false
    this.snapshot = { id, state: 'running', workspaceId, firmwareRoot: projectRoot, outputDir, completedFiles: 0, totalFiles: 5, logs: [], artifacts: [], stage: 'preparing', startedAt: new Date().toISOString() }
    this.emitEvent('snapshot')
    try {
      const sandbox = workspace.workspacePurpose === 'mcu-sandbox'
      const generationStatePath = join(this.outputBase, `${workspaceId}.sysconfig.json`)
      const previous: Record<string, string> = sandbox ? await readFile(generationStatePath, 'utf8').then(text => JSON.parse(text) as Record<string, string>, () => ({})) : {}
      const preserved = new Set<string>()
      if (sandbox) {
        for (const name of await readdir(generatedDir).catch(() => [])) {
          const path = join(generatedDir, name)
          if (!(await stat(path)).isFile()) continue
          const hash = createHash('sha256').update(await readFile(path)).digest('hex')
          const templateRoot = this.workspaces.getSandboxTemplateRoot(workspace.templateId)
          const original = !previous[name] && templateRoot ? await readFile(join(templateRoot, 'generated', name)).then(bytes => createHash('sha256').update(bytes).digest('hex'), () => undefined) : undefined
          if ((previous[name] ?? original) !== hash) preserved.add(name)
        }
      } else await rm(generatedDir, { recursive: true, force: true })
      await rm(outputDir, { recursive: true, force: true })
      await mkdir(generatedDir, { recursive: true })
      await mkdir(objectDir, { recursive: true })
      const sysconfigOutput = sandbox ? join(outputDir, 'sysconfig') : generatedDir
      await mkdir(sysconfigOutput, { recursive: true })
      this.log(`SysConfig · 正在根据 ${syscfgName} 生成硬件配置`)
      await this.runBatch(this.toolchain.getSysconfigCliPath(), ['--compiler', 'gcc', '--product', this.toolchain.getProductPath(), '--output', sysconfigOutput, join(projectRoot, syscfgName)], projectRoot)
      if (sandbox) {
        const hashes: Record<string, string> = {}
        for (const name of await readdir(sysconfigOutput)) {
          const source = join(sysconfigOutput, name)
          if (!(await stat(source)).isFile()) continue
          hashes[name] = createHash('sha256').update(await readFile(source)).digest('hex')
          if (!preserved.has(name)) await copyFile(source, join(generatedDir, name))
          else this.log(`保留学生修改 · generated/${name}`)
        }
        await writeFile(generationStatePath, JSON.stringify(hashes), 'utf8')
      }
      for (const required of ['ti_msp_dl_config.c', 'ti_msp_dl_config.h', 'device.opt', 'device.lds.genlibs']) {
        if (!(await stat(join(generatedDir, required)).then((item) => item.isFile(), () => false))) throw new Error(`SysConfig 没有生成 ${required}`)
      }
      this.snapshot.completedFiles = 1
      this.snapshot.stage = 'compiling'
      this.emitEvent('progress')

      const generatedSources = (await readdir(generatedDir)).filter((name) => name.endsWith('.c')).map((name) => join(generatedDir, name))
      const localStartup = join(projectRoot, 'gcc', 'startup_mspm0g350x_gcc.c')
      const startupSource = sandbox && await stat(localStartup).then(info => info.isFile(), () => false) ? localStartup : join(this.toolchain.sdkRoot, 'source', 'ti', 'devices', 'msp', 'm0p', 'startup_system_files', 'gcc', 'startup_mspm0g350x_gcc.c')
      const sources = [startupSource, ...(sandbox ? await this.collectSources(join(projectRoot, 'src')) : [join(projectRoot, 'src', 'main.c')]), ...generatedSources]
      const objects: string[] = []
      for (const [index, source] of sources.entries()) {
        this.throwIfCancelled()
        this.snapshot.currentFile = source.startsWith(projectRoot) ? source.slice(projectRoot.length + 1).replaceAll('\\', '/') : basename(source)
        this.log(`编译 · ${this.snapshot.currentFile}`)
        const object = join(objectDir, `${index}-${basename(source, '.c')}.o`)
        await this.run(this.toolchain.getGccPath(), [
          '-c', source, '-o', object, '-I', join(projectRoot, 'src'), '-I', generatedDir,
          ...(pony ? ['app', 'bsp', 'board', 'robotdog', 'middleware', 'deferred'].flatMap(directory => ['-I', join(projectRoot, 'src', directory)]) : []),
          ...(pony ? ['-DROBOTDOG_ENABLE_LEGACY_TEXT=0'] : []),
          `@${join(generatedDir, 'device.opt')}`, '-O2', '-mcpu=cortex-m0plus', '-march=armv6-m', '-mthumb', '-mfloat-abi=soft',
          '-std=c99', '-ffunction-sections', '-fdata-sections', '-g', '-Wall',
          '-I', join(this.toolchain.sdkRoot, 'source', 'third_party', 'CMSIS', 'Core', 'Include'), '-I', join(this.toolchain.sdkRoot, 'source')
        ], projectRoot)
        objects.push(object)
        this.snapshot.completedFiles = Math.min(3, index + 2)
        this.emitEvent('progress')
      }

      this.snapshot.stage = 'linking'
      this.snapshot.currentFile = `链接 ${artifactName}.out`
      const elf = join(outputDir, `${artifactName}.out`)
      const map = join(outputDir, `${artifactName}.map`)
      this.log(`链接 · ${artifactName}.out`)
      await this.run(this.toolchain.getGccPath(), [
        ...objects, '-o', elf, '-nostartfiles', `-T${join(generatedDir, 'device.lds.genlibs')}`, `-T${sandbox ? join(projectRoot, 'gcc', 'device_linker.lds') : join(generatedDir, 'device_linker.lds')}`,
        ...(pony ? [`-T${join(projectRoot, 'scripts', 'stack-guard.lds')}`] : []),
        `-Wl,-Map,${map}`, `-L${join(this.toolchain.sdkRoot, 'source', 'ti', 'driverlib', 'lib', 'gcc', 'm0p', 'mspm0g1x0x_g3x0x')}`,
        '-l:driverlib.a', `-L${join(this.toolchain.sdkRoot, 'source')}`, '-march=armv6-m', '-mthumb', '-static', '-Wl,--gc-sections',
        '-lgcc', '-lc', '-lm', '--specs=nano.specs', '--specs=nosys.specs'
      ], projectRoot)
      this.snapshot.completedFiles = 4
      this.snapshot.stage = 'packaging'
      this.emitEvent('progress')

      const hex = join(outputDir, `${artifactName}.hex`)
      const bin = join(outputDir, `${artifactName}.bin`)
      await this.run(this.toolchain.getObjcopyPath(), ['-O', 'ihex', elf, hex], projectRoot)
      await this.run(this.toolchain.getObjcopyPath(), ['-O', 'binary', elf, bin], projectRoot)
      const size = parseSize(await this.run(this.toolchain.getSizePath(), [elf], projectRoot))
      if (!size) throw new Error('无法读取 MSPM0 固件的 Flash/RAM 占用。')
      const artifacts = await Promise.all([
        artifact(elf, 'elf'), artifact(hex, 'hex'), artifact(bin, 'bin'), artifact(map, 'map')
      ])
      const completedAt = new Date().toISOString()
      const workspaceSourceHash = await this.fingerprint.calculate(projectRoot)
      const baselineStatus = await this.baselines?.resolveForWorkspace(workspace).getStatus()
      const proof: FirmwareBuildProof = {
        schemaVersion: 1, inputHash: createHash('sha256').update(`${workspace.headCommit}:${workspaceSourceHash}`).digest('hex'),
        workspaceId, workspaceCommit: workspace.headCommit, workspaceSourceHash,
        firmwareBaselineId: workspace.firmwareBaselineId, baselineCommit: workspace.baselineCommit, baselineSourceHash: 'mspm0-sdk-2.11.00.07',
        toolchain: tools.gcc.version ?? tools.gcc.detail, board: workspace.templateId === 'ti-mspm0g3507-foundations' ? 'TI MSPM0G3507 机器马教学板' : 'MSPM0G3507', size,
        artifacts: artifacts.map(({ name, kind, bytes, sha256 }) => ({ name, kind, bytes: bytes ?? 0, sha256: sha256! })),
        startedAt: this.snapshot.startedAt!, completedAt,
        releaseEligible: baselineStatus?.status === 'release' && baselineStatus.releaseEligible && baselineStatus.expectedCommit === workspace.baselineCommit
      }
      this.snapshot = { ...this.snapshot, state: 'completed', currentFile: undefined, completedFiles: 5, artifacts, size, proof, completedAt }
      this.log('固件生成 · ELF/HEX/BIN 已完成哈希校验', 'success')
      this.emitEvent('completed')
      return this.getSnapshot()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      this.snapshot = { ...this.snapshot, state: this.cancelled ? 'cancelled' : 'failed', error: message, completedAt: new Date().toISOString(), diagnostics: parseCompilerDiagnostics(this.snapshot.logs.join('\n')) }
      this.log(this.cancelled ? '构建已取消' : friendlyBuildError(message), 'error')
      this.emitEvent(this.cancelled ? 'cancelled' : 'failed')
      return this.getSnapshot()
    } finally { this.active = undefined }
  }

  cancel(): FirmwareBuildSnapshot {
    if (this.snapshot.state === 'running') { this.cancelled = true; this.active?.kill() }
    return this.getSnapshot()
  }

  async openSysconfig(workspaceId: string): Promise<boolean> {
    const workspace = await this.workspaces.get(workspaceId)
    if (workspace.platform !== 'ti-mspm0') throw new Error('只能为 TI MSPM0 工程打开 SysConfig。')
    const root = await this.workspaces.getProjectRootForMain(workspaceId)
    const syscfgName = ['ti-mspm0g3507-pony', 'ti-mspm0g3507-sdk-empty'].includes(workspace.templateId) ? 'board.syscfg' : 'gpio_toggle_output.syscfg'
    const launch = await prepareSysconfigLaunch({ sysconfigRoot: this.toolchain.sysconfigRoot,
      productPath: this.toolchain.getProductPath(), projectFile: join(root, syscfgName),
      launcherRoot: join(this.outputBase, 'sysconfig-gui', workspace.id) })
    await new Promise<void>((resolveLaunch, reject) => {
      const child = spawn(launch.executable, launch.args, { cwd: root, windowsHide: false, detached: true, stdio: 'ignore' })
      child.once('error', reject)
      child.once('spawn', () => { child.unref(); resolveLaunch() })
    })
    return true
  }

  private async collectSources(root: string): Promise<string[]> {
    const sources: string[] = []
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const path = join(root, entry.name)
      if (entry.isDirectory()) sources.push(...await this.collectSources(path))
      else if (entry.isFile() && entry.name.endsWith('.c')) sources.push(path)
    }
    return sources.sort()
  }

  private runBatch(batch: string, args: string[], cwd: string): Promise<string> {
    return this.run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'call', batch, ...args], cwd)
  }

  private run(executable: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolveOutput, reject) => {
      const child = spawn(executable, args, { cwd, windowsHide: true, env: { ...process.env, PATH: `${join(this.toolchain.gccRoot, 'bin')};${process.env.PATH ?? ''}` } })
      this.active = child
      let output = ''
      const append = (chunk: Buffer): void => { const text = chunk.toString(); output += text; for (const line of text.split(/\r?\n/).filter(Boolean)) this.log(line) }
      child.stdout.on('data', append); child.stderr.on('data', append)
      child.on('error', reject)
      child.on('close', (code) => code === 0 ? resolveOutput(output) : reject(new Error(output.trim() || `进程退出码 ${code ?? 'unknown'}`)))
    })
  }

  private throwIfCancelled(): void { if (this.cancelled) throw new Error('构建已取消') }
  private log(line: string, level: 'info' | 'warning' | 'error' | 'success' = 'info'): void { this.snapshot.logs.push(line); this.emit('event', { type: 'log', line, level }) }
  private emitEvent(type: FirmwareBuildEvent['type']): void { this.emit('event', { type: type as 'snapshot', snapshot: this.getSnapshot() } as FirmwareBuildEvent) }
}

function idle(): FirmwareBuildSnapshot { return { state: 'idle', firmwareRoot: '', completedFiles: 0, totalFiles: 0, logs: [], artifacts: [] } }
async function artifact(path: string, kind: FirmwareBuildArtifact['kind']): Promise<FirmwareBuildArtifact> { const data = await readFile(path); return { name: basename(path), path, kind, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') } }
function parseSize(output: string): FirmwareSizeInfo | undefined { const row = output.split(/\r?\n/).find((line) => /^\s*\d+\s+\d+\s+\d+\s+\d+\s+[0-9a-f]+\s+/i.test(line)); if (!row) return undefined; const [text, data, bss, dec, hex] = row.trim().split(/\s+/); return { text: Number(text), data: Number(data), bss: Number(bss), dec: Number(dec), hex } }
function friendlyBuildError(message: string): string { if (/sysconfig/i.test(message)) return `SysConfig 生成失败：${message}`; if (/cannot find|no such file/i.test(message)) return `构建输入缺失：${message}`; return message }
