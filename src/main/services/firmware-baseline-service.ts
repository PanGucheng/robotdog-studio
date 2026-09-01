import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { FirmwareBaselineManifest, FirmwareBaselineStatus } from '../../shared/types'

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const relativePathSchema = z.string().min(1).refine((value) => !isAbsolute(value) && !value.split(/[\\/]/).includes('..'), '必须是基线内相对路径')
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(96),
  label: z.string().min(1).max(128),
  status: z.enum(['provisional', 'release']),
  releaseEligible: z.boolean(),
  replacementPolicy: z.string().min(1),
  source: z.object({ repository: z.string().min(1), expectedCommit: z.string().regex(/^[a-f0-9]{40}$/), developmentDefaultRoot: z.string().min(1) }),
  target: z.object({
    board: z.string().min(1), chip: z.string().min(1), startup: relativePathSchema, linkerScript: relativePathSchema,
    memory: z.object({ flashBytes: z.number().int().positive(), ramBytes: z.number().int().positive(), confirmed: z.boolean() })
  }),
  toolchain: z.object({ profile: z.string().min(1), arch: z.string().min(1), abi: z.string().min(1), codeModel: z.string().min(1) }),
  build: z.object({
    includeDirectories: z.array(relativePathSchema).min(1), sources: z.array(relativePathSchema).min(1),
    cFlags: z.array(z.string()), assemblerFlags: z.array(z.string()), linkFlags: z.array(z.string())
  }),
  studentOverlay: z.object({ source: relativePathSchema, header: relativePathSchema, configInput: relativePathSchema, generatedHeader: relativePathSchema }),
  artifacts: z.object({ elf: relativePathSchema, hex: relativePathSchema, bin: relativePathSchema, map: relativePathSchema }),
  integrity: z.array(z.object({ path: relativePathSchema, sha256: sha256Schema })).min(1)
}).strict()

export interface FirmwareBaselineServiceOptions {
  manifestPath: string
  packagedSourceRoot?: string
  developmentSourceRoot?: string
}

export class FirmwareBaselineService {
  private manifest?: FirmwareBaselineManifest

  constructor(private readonly options: FirmwareBaselineServiceOptions) {}

  async getManifest(): Promise<FirmwareBaselineManifest> {
    if (!this.manifest) {
      const raw = JSON.parse(await readFile(this.options.manifestPath, 'utf8')) as Record<string, unknown>
      this.manifest = raw.schemaVersion === 2 ? await this.readLiveManifest(raw) : manifestSchema.parse(raw) as FirmwareBaselineManifest
    }
    return structuredClone(this.manifest)
  }

  async getStatus(): Promise<FirmwareBaselineStatus> {
    const manifest = await this.getManifest()
    const sourceRoot = this.resolveSourceRoot(manifest)
    const errors: string[] = []
    const warnings: string[] = []
    const verified: string[] = []
    for (const item of manifest.integrity) {
      try {
        const path = resolveInside(sourceRoot, item.path)
        const info = await stat(path)
        if (!info.isFile()) throw new Error('不是普通文件')
        const actual = createHash('sha256').update(await readFile(path)).digest('hex')
        if (actual !== item.sha256) throw new Error('内容哈希与临时基线不一致')
        verified.push(item.path)
      } catch (caught) {
        errors.push(`${item.path}：${caught instanceof Error ? caught.message : String(caught)}`)
      }
    }
    if (manifest.schemaVersion === 1) {
      for (const source of manifest.build.sources) {
        try { if (!(await stat(resolveInside(sourceRoot, source))).isFile()) errors.push(`${source}：不是普通文件`) }
        catch { errors.push(`${source}：文件不存在`) }
      }
    } else {
      const firmwareManifest = basename(manifest.live.manifestPath)
      for (const source of ['CMakeLists.txt', 'CMakePresets.json', firmwareManifest]) {
        try { if (!(await stat(resolveInside(sourceRoot, source))).isFile()) errors.push(`${source}：不是普通文件`) }
        catch { errors.push(`${source}：文件不存在`) }
      }
    }
    if (manifest.status === 'provisional') warnings.push('当前使用未确认的临时固件工程，只可用于功能测试，不能作为发布固件。')
    if (!manifest.target.memory.confirmed) warnings.push('MCU 型号、启动文件和 Flash/RAM 布局尚未由下位机开发者确认。')
    if (!manifest.releaseEligible) warnings.push('该基线明确禁止进入正式安装包。')
    return {
      id: manifest.id, label: manifest.label, sourceRoot, expectedCommit: manifest.source.expectedCommit,
      status: manifest.status, readyForTesting: errors.length === 0, releaseEligible: manifest.releaseEligible && errors.length === 0,
      verifiedFiles: verified, errors, warnings, memory: structuredClone(manifest.target.memory)
    }
  }

  async requireTestingBaseline(): Promise<{ manifest: FirmwareBaselineManifest; sourceRoot: string; sourceHash: string }> {
    const [manifest, status] = await Promise.all([this.getManifest(), this.getStatus()])
    if (!status.readyForTesting) throw new Error(`临时固件基线不可用：${status.errors.join('；')}`)
    const sourceHash = manifest.schemaVersion === 2
      ? await calculateSourceContentHash(status.sourceRoot)
      : createHash('sha256').update(JSON.stringify({ id: manifest.id, commit: manifest.source.expectedCommit, integrity: manifest.integrity })).digest('hex')
    return { manifest, sourceRoot: status.sourceRoot, sourceHash }
  }

  private resolveSourceRoot(manifest: FirmwareBaselineManifest): string {
    const override = this.options.developmentSourceRoot ?? process.env.ROBOTDOG_FIRMWARE_ROOT
    if (override) return resolve(override)
    if (this.options.packagedSourceRoot) return resolve(this.options.packagedSourceRoot)
    if (manifest.schemaVersion === 2) {
      const declaredRoot = resolve(manifest.source.developmentDefaultRoot)
      const appRoot = resolve(dirname(this.options.manifestPath), '..', '..', '..')
      const sourceRoot = join(appRoot, '.firmware-sources', 'ch32v203-robot-dog')
      // The live registry may point at the checked-in baseline directory while
      // its manifest/source pair lives in the fetched development checkout.
      if (basename(manifest.live.manifestPath) === 'robotdog.firmware.json' && existsSync(join(sourceRoot, 'robotdog.firmware.json'))) return sourceRoot
      if (existsSync(declaredRoot)) return declaredRoot
      if (existsSync(sourceRoot)) return sourceRoot
    }
    return resolve(manifest.source.developmentDefaultRoot)
  }

  private async readLiveManifest(active: Record<string, unknown>): Promise<FirmwareBaselineManifest> {
    const activeDir = dirname(this.options.manifestPath)
    const manifestRelative = typeof active.verifiedFirmwareManifest === 'string' ? active.verifiedFirmwareManifest : ''
    const firmwareManifestPath = resolveInside(activeDir, manifestRelative)
    const firmware = JSON.parse(await readFile(firmwareManifestPath, 'utf8')) as Record<string, any>
    const activeCommit = stringValue(active.activeCommit, 'activeCommit')
    const shortCommit = stringValue(active.shortCommit, 'shortCommit')
    const studentOverlay = firmware.studentOverlay
    const memory = firmware.memory ?? {}
    return {
      schemaVersion: 2,
      id: String(active.id ?? `ch32v203-rhs-${shortCommit}`),
      label: String(active.label ?? `CH32V203 RHS 固件基线 ${shortCommit}`),
      status: 'provisional',
      releaseEligible: false,
      replacementPolicy: '开发阶段动态固件基线；通过验证后可切换，学生工作区不自动覆盖。',
      source: {
        repository: typeof active.remote === 'object' && active.remote && 'url' in active.remote ? String((active.remote as { url?: unknown }).url) : 'firmware/ch32v203-baseline',
        expectedCommit: activeCommit,
        developmentDefaultRoot: String(active.sourceRoot ?? 'D:\\RobotDog\\RobotDog_Studio\\firmware\\ch32v203-baseline')
      },
      target: {
        board: String(firmware.board ?? 'rhs-ch32v203c8t6'),
        chip: String(firmware.chip ?? 'CH32V203C8T6'),
        startup: String(firmware.build?.startup ?? 'Startup/startup_ch32v20x_D6.S'),
        linkerScript: String(firmware.build?.linkerScript ?? 'Ld/Link.ld'),
        memory: { flashBytes: Number(memory.flashBytes ?? 65536), ramBytes: Number(memory.ramBytes ?? 20480), confirmed: Boolean(firmware.hardwareStatus?.mcuConfirmed) }
      },
      toolchain: { profile: 'ch32v203-wch-gcc12', arch: 'rv32imac', abi: 'ilp32', codeModel: 'medlow' },
      build: { type: 'cmake', preset: String(active.build && typeof active.build === 'object' && 'preset' in active.build ? (active.build as { preset?: unknown }).preset : 'wch-gcc12'), outputDir: '.firmware-build/ch32v203-rhs', toolchain: String(firmware.build?.toolchain ?? 'WCH RISC-V Embedded GCC12') },
      studentOverlay: {
        source: String(studentOverlay?.source ?? 'App/Src/experiment.c'),
        header: String(studentOverlay?.header ?? 'App/Inc/experiment.h'),
        ...(studentOverlay?.configInput ? { configInput: String(studentOverlay.configInput) } : {}),
        ...(studentOverlay?.generatedHeader ? { generatedHeader: String(studentOverlay.generatedHeader) } : {})
      },
      artifacts: {
        elf: String(firmware.artifacts?.elf ?? 'RHSFirmwareBaseline.elf'),
        hex: String(firmware.artifacts?.hex ?? 'RHSFirmwareBaseline.hex'),
        bin: String(firmware.artifacts?.bin ?? 'RHSFirmwareBaseline.bin'),
        map: String(firmware.artifacts?.map ?? 'RHSFirmwareBaseline.map'),
        size: String(firmware.artifacts?.size ?? 'RHSFirmwareBaseline.size.txt'),
        hashes: String(firmware.artifacts?.hashes ?? 'RHSFirmwareBaseline.sha256.txt'),
        sourceInput: String(firmware.artifacts?.sourceInput ?? 'RHSFirmwareBaseline.input.json')
      },
      integrity: [],
      live: {
        activeCommit, shortCommit,
        manifestPath: manifestRelative,
        verificationReport: typeof active.verificationReport === 'string' ? active.verificationReport : undefined,
        flashFreeBytes: Number((active.verification as { flashFreeBytes?: unknown } | undefined)?.flashFreeBytes),
        ramUsedBytes: Number((active.verification as { ramUsedBytes?: unknown } | undefined)?.ramUsedBytes)
      }
    }
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`ACTIVE_BASELINE_${label}_INVALID`)
  return value
}

async function calculateSourceContentHash(root: string): Promise<string> {
  const hash = createHash('sha256')
  const include = new Set(['Startup', 'Core', 'RHS_HAL', 'Board', 'Teaching', 'User', 'Peripheral', 'Ld', 'CMakeLists.txt', 'CMakePresets.json', 'rhs.firmware.json', 'robotdog.firmware.json'])
  const visit = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name)
      const rel = relative(root, path).replaceAll('\\', '/')
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && (include.has(rel) || [...include].some((prefix) => rel.startsWith(`${prefix}/`)))) {
        hash.update(rel); hash.update(await readFile(path))
      }
    }
  }
  await visit(root)
  return hash.digest('hex')
}

function resolveInside(root: string, child: string): string {
  const candidate = resolve(root, child)
  const rel = relative(resolve(root), candidate)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('路径越过固件基线')
  return candidate
}
