import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import { promisify } from 'node:util'
import type { CandidateBuildProof } from '../../shared/types'
import { CandidateBuildError, parseCompilerDiagnostics, type CandidateBuilder, type CandidateBuildInput } from './candidate-build-service'
import { TiMspm0ToolchainService } from './ti-mspm0-toolchain-service'

const execFileAsync = promisify(execFile)

/** Fast TI candidate preflight: regenerate SysConfig in isolation, then compile every candidate source. */
export class TiMspm0CandidateBuildService implements CandidateBuilder {
  constructor(private readonly toolchain: TiMspm0ToolchainService, private readonly cacheRoot: string) {}

  async build(input: CandidateBuildInput): Promise<CandidateBuildProof> {
    if (input.platform !== 'ti-mspm0') throw new Error('TI 候选构建拒绝处理非 MSPM0 工程。')
    const status = await this.toolchain.getStatus()
    if (!status.gcc.ok || !status.sysconfig?.ok || !status.sdk?.ok) throw new Error('TI 候选编译不可用：请检查 MSPM0 SDK、SysConfig 和 Arm GCC。')

    const outputDir = join(this.cacheRoot, input.candidateId)
    const generatedDir = join(outputDir, 'generated')
    const objectDir = join(outputDir, 'obj')
    await rm(outputDir, { recursive: true, force: true })
    await mkdir(generatedDir, { recursive: true })
    await mkdir(objectDir, { recursive: true })

    const syscfgFiles = (await readdir(input.candidateRoot)).filter((name) => name.toLowerCase().endsWith('.syscfg'))
    if (syscfgFiles.length !== 1) throw new CandidateBuildError([{ severity: 'error', message: 'TI 候选工程必须包含且只能包含一个 .syscfg 文件。' }], 'TI_SYSCONFIG_INPUT_INVALID')
    try {
      await runBatch(this.toolchain.getSysconfigCliPath(), [
        '--compiler', 'gcc', '--product', this.toolchain.getProductPath(), '--output', generatedDir,
        join(input.candidateRoot, syscfgFiles[0])
      ], input.candidateRoot, this.toolchain.gccRoot)
      for (const required of ['ti_msp_dl_config.c', 'ti_msp_dl_config.h', 'device.opt']) {
        if (!(await stat(join(generatedDir, required)).then((item) => item.isFile(), () => false))) throw new Error(`SysConfig 没有生成 ${required}`)
      }

      const sources = [...(await collectCFiles(join(input.candidateRoot, 'src'))), ...(await collectCFiles(generatedDir))]
      if (sources.length === 0) throw new Error('TI 候选工程中没有找到 C 源文件。')
      const objectHash = createHash('sha256')
      for (const [index, source] of sources.entries()) {
        const object = join(objectDir, `${index}-${basename(source, '.c')}.o`)
        await run(this.toolchain.getGccPath(), [
          '-c', source, '-o', object, '-I', join(input.candidateRoot, 'src'), '-I', generatedDir,
          `@${join(generatedDir, 'device.opt')}`, '-O0', '-mcpu=cortex-m0plus', '-march=armv6-m', '-mthumb', '-mfloat-abi=soft',
          '-std=c99', '-ffunction-sections', '-fdata-sections', '-Wall', '-Wextra', '-Werror=implicit-function-declaration',
          '-I', join(this.toolchain.sdkRoot, 'source', 'third_party', 'CMSIS', 'Core', 'Include'), '-I', join(this.toolchain.sdkRoot, 'source')
        ], input.candidateRoot, this.toolchain.gccRoot)
        objectHash.update(await readFile(object))
      }
      return {
        candidateId: input.candidateId, sourceTreeHash: input.sourceTreeHash, diffHash: input.diffHash,
        compiler: status.gcc.version ?? status.gcc.detail, objectSha256: objectHash.digest('hex'), completedAt: new Date().toISOString(),
        checks: [
          { id: 'sysconfig-current', label: 'SysConfig 配置', detail: `已从候选 ${syscfgFiles[0]} 重新生成，未使用旧 generated 文件` },
          { id: 'ti-project-sources', label: 'MSPM0 候选源码', detail: `${sources.length} 个 C 源文件通过 Arm GCC 编译` }
        ]
      }
    } catch (caught) {
      if (caught instanceof CandidateBuildError) throw caught
      const detail = redact(buildErrorDetail(caught), input.candidateRoot, outputDir, this.toolchain.sdkRoot)
      throw new CandidateBuildError(parseCompilerDiagnostics(detail), detail)
    }
  }
}

async function collectCFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.c')) files.push(path)
    }
  }
  await visit(root)
  return files.sort((left, right) => relative(root, left).localeCompare(relative(root, right), 'en-US'))
}

async function runBatch(batch: string, args: string[], cwd: string, gccRoot: string): Promise<void> {
  await run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'call', batch, ...args], cwd, gccRoot)
}

async function run(executable: string, args: string[], cwd: string, gccRoot: string): Promise<void> {
  await execFileAsync(executable, args, { cwd, windowsHide: true, timeout: 60_000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, PATH: `${join(gccRoot, 'bin')};${process.env.PATH ?? ''}` } })
}

function buildErrorDetail(caught: unknown): string {
  if (!caught || typeof caught !== 'object') return String(caught)
  const value = caught as { stderr?: string; stdout?: string; message?: string }
  return (value.stderr || value.stdout || value.message || '未知编译错误').trim().slice(0, 4_000)
}

function redact(detail: string, candidateRoot: string, outputRoot: string, sdkRoot: string): string {
  let result = detail
  for (const [root, replacement] of [[candidateRoot, '[候选项目]'], [outputRoot, '[候选生成]'], [sdkRoot, '[MSPM0 SDK]']] as const) result = result.replaceAll(root, replacement).replaceAll(root.replaceAll('\\', '/'), replacement)
  return result
}
