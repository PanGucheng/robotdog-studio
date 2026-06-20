import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { CandidateBuildProof } from '../../shared/types'
import { ToolchainService } from './toolchain-service'

const execFileAsync = promisify(execFile)

export interface CandidateBuildInput {
  candidateId: string
  candidateRoot: string
  sourceTreeHash: string
  diffHash: string
}

export interface CandidateBuilder {
  build(input: CandidateBuildInput): Promise<CandidateBuildProof>
}

export class CandidateBuildService implements CandidateBuilder {
  constructor(private readonly toolchain: ToolchainService, private readonly cacheRoot: string) {}

  async build(input: CandidateBuildInput): Promise<CandidateBuildProof> {
    const status = await this.toolchain.getStatus()
    if (!status.gcc.ok) throw new Error(`候选编译不可用：${status.gcc.detail}`)
    const outputDir = join(this.cacheRoot, input.candidateId)
    const objectPath = join(outputDir, 'student_control.o')
    await rm(outputDir, { recursive: true, force: true })
    await mkdir(outputDir, { recursive: true })

    const sourcePath = join(input.candidateRoot, 'Core', 'Src', 'student_control.c')
    const includePath = join(input.candidateRoot, 'Core', 'Inc')
    try {
      await execFileAsync(status.gcc.path, [
        '-march=rv32imac', '-mabi=ilp32', '-ffreestanding', '-fno-builtin',
        '-Wall', '-Wextra', '-Werror=implicit-function-declaration',
        '-I', includePath, '-c', sourcePath, '-o', objectPath
      ], { cwd: input.candidateRoot, windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 })
    } catch (caught) {
      const detail = redactBuildPath(buildErrorDetail(caught), input.candidateRoot)
      throw new Error(`学生控制代码编译失败：${detail}`)
    }

    const configDetail = await validateLineConfig(join(input.candidateRoot, 'student-config', 'line-following.yaml'))
    const objectSha256 = createHash('sha256').update(await readFile(objectPath)).digest('hex')
    return {
      candidateId: input.candidateId,
      sourceTreeHash: input.sourceTreeHash,
      diffHash: input.diffHash,
      compiler: status.gcc.version ?? status.gcc.detail,
      objectSha256,
      completedAt: new Date().toISOString(),
      checks: [
        { id: 'c-source', label: '学生控制代码', detail: 'WCH GCC 编译通过' },
        { id: 'line-config', label: '巡线参数', detail: configDetail }
      ]
    }
  }
}

async function validateLineConfig(path: string): Promise<string> {
  return validateLineConfigText(await readFile(path, 'utf8'))
}

export function validateLineConfigText(text: string): string {
  const values = new Map<string, number>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const match = /^([a-z_][a-z0-9_]*)\s*:\s*(-?\d+)$/i.exec(line)
    if (!match) throw new Error(`巡线参数格式错误：${raw.trim()}`)
    values.set(match[1], Number(match[2]))
  }
  const turn = values.get('turn_strength')
  const target = values.get('line_target')
  if (!Number.isInteger(turn) || turn! < 1 || turn! > 30) throw new Error('turn_strength 必须是 1–30 的整数')
  if (!Number.isInteger(target) || target! < 0 || target! > 127) throw new Error('line_target 必须是 0–127 的整数')
  return `turn_strength=${turn}，line_target=${target}`
}

function buildErrorDetail(caught: unknown): string {
  if (!caught || typeof caught !== 'object') return String(caught)
  const value = caught as { stderr?: string; stdout?: string; message?: string }
  return (value.stderr || value.stdout || value.message || '未知编译错误').trim().slice(0, 1_500)
}

function redactBuildPath(detail: string, root: string): string {
  return detail.replaceAll(root, '[候选项目]').replaceAll(root.replaceAll('\\', '/'), '[候选项目]')
}
