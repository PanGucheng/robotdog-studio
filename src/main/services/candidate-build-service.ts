import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
import type { CandidateBuildProof, CandidateDiagnostic } from '../../shared/types'
import type { EditionId } from '../../shared/edition'
import { ToolchainService } from './toolchain-service'

const execFileAsync = promisify(execFile)

export interface CandidateBuildInput {
  candidateId: string
  candidateRoot: string
  sourceTreeHash: string
  diffHash: string
  learningPath?: EditionId
}

export interface CandidateBuilder {
  build(input: CandidateBuildInput): Promise<CandidateBuildProof>
}

export class CandidateBuildError extends Error {
  constructor(readonly diagnostics: CandidateDiagnostic[], readonly detail: string) {
    super(diagnostics[0]?.message ?? '代码没有通过编译。')
    this.name = 'CandidateBuildError'
  }
}

export class CandidateBuildService implements CandidateBuilder {
  constructor(private readonly toolchain: ToolchainService, private readonly cacheRoot: string) {}

  async build(input: CandidateBuildInput): Promise<CandidateBuildProof> {
    const status = await this.toolchain.getStatus()
    if (!status.gcc.ok) throw new Error(`候选编译不可用：${status.gcc.detail}`)
    const outputDir = join(this.cacheRoot, input.candidateId)
    if (input.learningPath === 'mcu-foundations') return this.buildMcuProject(input, status.gcc.path, status.gcc.version ?? status.gcc.detail, outputDir)
    const objectPath = join(outputDir, 'student_control.o')
    await rm(outputDir, { recursive: true, force: true })
    await mkdir(outputDir, { recursive: true })

    const sourcePath = join(input.candidateRoot, 'Core', 'Src', 'student_control.c')
    const includePath = join(input.candidateRoot, 'Core', 'Inc')
    let config: ReturnType<typeof parseLineConfigText>
    try {
      config = parseLineConfigText(await readFile(join(input.candidateRoot, 'student-config', 'line-following.yaml'), 'utf8'))
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      throw new CandidateBuildError([{ path: 'student-config/line-following.yaml', severity: 'error', message }], message)
    }
    await writeFile(join(outputDir, 'student_config.generated.h'), renderStudentConfigHeader(config), 'utf8')
    try {
      await execFileAsync(status.gcc.path, [
        '-march=rv32imac', '-mabi=ilp32', '-ffreestanding', '-fno-builtin',
        '-Wall', '-Wextra', '-Werror=implicit-function-declaration',
        '-I', outputDir, '-I', includePath, '-c', sourcePath, '-o', objectPath
      ], { cwd: input.candidateRoot, windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 })
    } catch (caught) {
      const detail = redactBuildPath(buildErrorDetail(caught), input.candidateRoot)
      throw new CandidateBuildError(parseCompilerDiagnostics(detail), detail)
    }

    const configDetail = `turn_strength=${config.turnStrength}，line_target=${config.lineTarget}`
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

  private async buildMcuProject(input: CandidateBuildInput, gccPath: string, compiler: string, outputDir: string): Promise<CandidateBuildProof> {
    await rm(outputDir, { recursive: true, force: true })
    await mkdir(outputDir, { recursive: true })
    const sourcePaths = [
      join(input.candidateRoot, 'Core', 'Src', 'student_control.c'),
      ...await collectCFiles(join(input.candidateRoot, 'App', 'Src'))
    ]
    if (sourcePaths.length < 2) throw new CandidateBuildError([{ severity: 'error', message: '单片机教学目录中没有找到实验源文件。' }], 'MCU_SOURCE_MISSING')
    const includePaths = [join(input.candidateRoot, 'Core', 'Inc'), join(input.candidateRoot, 'App', 'Inc')]
    const objectHash = createHash('sha256')
    try {
      for (const [index, sourcePath] of sourcePaths.entries()) {
        const objectPath = join(outputDir, `${index}-${sourcePath.split(/[\\/]/).at(-1)}.o`)
        await execFileAsync(gccPath, [
          '-march=rv32imac', '-mabi=ilp32', '-ffreestanding', '-fno-builtin',
          '-Wall', '-Wextra', '-Wconversion', '-Werror=implicit-function-declaration',
          ...includePaths.flatMap((path) => ['-I', path]), '-c', sourcePath, '-o', objectPath
        ], { cwd: input.candidateRoot, windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024 })
        objectHash.update(await readFile(objectPath))
      }
    } catch (caught) {
      const detail = redactBuildPath(buildErrorDetail(caught), input.candidateRoot)
      throw new CandidateBuildError(parseCompilerDiagnostics(detail), detail)
    }
    return {
      candidateId: input.candidateId,
      sourceTreeHash: input.sourceTreeHash,
      diffHash: input.diffHash,
      compiler,
      objectSha256: objectHash.digest('hex'),
      completedAt: new Date().toISOString(),
      checks: [{ id: 'project-sources', label: '单片机实验源码', detail: `${sourcePaths.length} 个 C 源文件通过 WCH GCC 编译` }]
    }
  }
}

export function parseCompilerDiagnostics(detail: string): CandidateDiagnostic[] {
  const diagnostics: CandidateDiagnostic[] = []
  const pattern = /([^\r\n:]*?\.(?:c|h)):(\d+)(?::(\d+))?:\s*(fatal error|error|warning):\s*([^\r\n]+)/gi
  for (const match of detail.matchAll(pattern)) {
    const source = match[1].replaceAll('\\', '/').replace(/^\[候选项目\]\/?/i, '')
    const knownStart = source.search(/(?:Core|App|student-config)\//i)
    const path = knownStart >= 0 ? source.slice(knownStart) : undefined
    diagnostics.push({
      path,
      line: Number(match[2]),
      column: match[3] ? Number(match[3]) : undefined,
      severity: match[4].toLowerCase().includes('warning') ? 'warning' : 'error',
      message: cleanCompilerMessage(match[5])
    })
    if (diagnostics.length >= 6) break
  }
  if (diagnostics.length > 0) return diagnostics
  const fallback = detail.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .find((line) => /error|undefined|failed|expected/i.test(line)) ?? '编译器没有认出这段代码。'
  return [{ severity: 'error', message: cleanCompilerMessage(fallback) }]
}

async function collectCFiles(root: string): Promise<string[]> {
  const results: string[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.c')) results.push(path)
    }
  }
  await visit(root)
  return results.sort((left, right) => relative(root, left).localeCompare(relative(root, right), 'en-US'))
}

function cleanCompilerMessage(message: string): string {
  return message.replace(/^.*?\b(?:fatal error|error):\s*/i, '').replace(/\s*\[-W[^\]]+\]\s*$/, '').trim().slice(0, 300)
}

export function validateLineConfigText(text: string): string {
  const parsed = parseLineConfigText(text)
  return `turn_strength=${parsed.turnStrength}，line_target=${parsed.lineTarget}`
}

export function parseLineConfigText(text: string): { turnStrength: number; lineTarget: number } {
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
  return { turnStrength: turn!, lineTarget: target! }
}

export function renderStudentConfigHeader(config: { turnStrength: number; lineTarget: number }): string {
  return [
    '#ifndef STUDENT_CONFIG_GENERATED_H', '#define STUDENT_CONFIG_GENERATED_H', '',
    `#define STUDENT_CONFIG_TURN_STRENGTH ${config.turnStrength}U`, `#define STUDENT_CONFIG_LINE_TARGET ${config.lineTarget}U`,
    '#define STUDENT_TURN_STRENGTH STUDENT_CONFIG_TURN_STRENGTH', '#define STUDENT_LINE_TARGET STUDENT_CONFIG_LINE_TARGET', '',
    '#if STUDENT_CONFIG_TURN_STRENGTH < 1U || STUDENT_CONFIG_TURN_STRENGTH > 30U', '#error "turn_strength must be an integer from 1 to 30"', '#endif',
    '#if STUDENT_CONFIG_LINE_TARGET > 127U', '#error "line_target must be an integer from 0 to 127"', '#endif', '', '#endif', ''
  ].join('\n')
}

function buildErrorDetail(caught: unknown): string {
  if (!caught || typeof caught !== 'object') return String(caught)
  const value = caught as { stderr?: string; stdout?: string; message?: string }
  return (value.stderr || value.stdout || value.message || '未知编译错误').trim().slice(0, 1_500)
}

function redactBuildPath(detail: string, root: string): string {
  return detail.replaceAll(root, '[候选项目]').replaceAll(root.replaceAll('\\', '/'), '[候选项目]')
}
