import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
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
    if (!this.manifest) this.manifest = manifestSchema.parse(JSON.parse(await readFile(this.options.manifestPath, 'utf8'))) as FirmwareBaselineManifest
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
    for (const source of manifest.build.sources) {
      try { if (!(await stat(resolveInside(sourceRoot, source))).isFile()) errors.push(`${source}：不是普通文件`) }
      catch { errors.push(`${source}：文件不存在`) }
    }
    if (manifest.status === 'provisional') warnings.push('当前使用未确认的临时固件工程，只可用于功能测试，不能作为发布固件。')
    if (!manifest.target.memory.confirmed) warnings.push('MCU 型号、启动文件和 Flash/RAM 布局尚未由下位机开发者确认。')
    if (!manifest.releaseEligible) warnings.push('该基线明确禁止进入正式安装包。')
    return {
      id: manifest.id, label: manifest.label, sourceRoot, expectedCommit: manifest.source.expectedCommit,
      status: manifest.status, readyForTesting: errors.length === 0, releaseEligible: manifest.releaseEligible && errors.length === 0,
      verifiedFiles: verified, errors, warnings
    }
  }

  async requireTestingBaseline(): Promise<{ manifest: FirmwareBaselineManifest; sourceRoot: string; sourceHash: string }> {
    const [manifest, status] = await Promise.all([this.getManifest(), this.getStatus()])
    if (!status.readyForTesting) throw new Error(`临时固件基线不可用：${status.errors.join('；')}`)
    const sourceHash = createHash('sha256').update(JSON.stringify({ id: manifest.id, commit: manifest.source.expectedCommit, integrity: manifest.integrity })).digest('hex')
    return { manifest, sourceRoot: status.sourceRoot, sourceHash }
  }

  private resolveSourceRoot(manifest: FirmwareBaselineManifest): string {
    const override = this.options.developmentSourceRoot ?? process.env.ROBOTDOG_FIRMWARE_ROOT
    if (override) return resolve(override)
    if (this.options.packagedSourceRoot) return resolve(this.options.packagedSourceRoot)
    return resolve(manifest.source.developmentDefaultRoot)
  }
}

function resolveInside(root: string, child: string): string {
  const candidate = resolve(root, child)
  const rel = relative(resolve(root), candidate)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('路径越过固件基线')
  return candidate
}
