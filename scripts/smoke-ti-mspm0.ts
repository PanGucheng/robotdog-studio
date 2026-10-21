import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { EDITION_PROFILES } from '../src/shared/edition'
import { CandidateService } from '../src/main/services/candidate-service'
import { PlatformCandidateBuildService, type CandidateBuilder } from '../src/main/services/candidate-build-service'
import { TiMspm0CandidateBuildService } from '../src/main/services/ti-mspm0-candidate-build-service'
import { TiMspm0BuildService } from '../src/main/services/ti-mspm0-build-service'
import { TiMspm0FlashService } from '../src/main/services/ti-mspm0-flash-service'
import { TiMspm0ToolchainService } from '../src/main/services/ti-mspm0-toolchain-service'
import { WorkspaceService, type WorkspaceServiceOptions } from '../src/main/services/workspace-service'

const root = await mkdtemp(join(tmpdir(), 'robotdog-ti-mspm0-smoke-'))
const resourcesIndex = process.argv.indexOf('--resources-root')
const resourcesRoot = resourcesIndex >= 0 ? resolve(process.argv[resourcesIndex + 1] ?? '') : undefined
try {
  const toolchain = new TiMspm0ToolchainService(resourcesRoot ? { resourcesPath: resourcesRoot } : {})
  const status = await toolchain.getStatus()
  for (const tool of [status.sdk, status.sysconfig, status.gcc, status.objcopy, status.size, status.openocd]) {
    if (!tool?.ok) throw new Error(`${tool?.label ?? '工具'} 不可用：${tool?.detail ?? 'unknown'}`)
  }
  const sandboxTemplates: WorkspaceServiceOptions['sandboxTemplates'] = {}
  for (const projectType of ['sdk-empty', 'pony'] as const) {
    const templateId = `ti-mspm0g3507-${projectType}`
    const templateRoot = resourcesRoot ? join(resourcesRoot, 'workspace-templates', templateId) : resolve('resources/workspace-templates', templateId)
    const baselineRoot = resourcesRoot ? join(resourcesRoot, 'firmware-baselines', templateId) : resolve('resources/firmware-baselines', templateId)
    const manifest = JSON.parse(await readFile(join(baselineRoot, 'manifest.json'), 'utf8'))
    sandboxTemplates[projectType] = { templateRoot, templateId, templateVersion: projectType === 'pony' ? '0.2.5-ti.1' : '1', firmwareBaselineId: manifest.id, baselineCommit: manifest.source.expectedCommit }
  }
  const workspaces = new WorkspaceService({
    rootDir: root,
    templateRoot: resourcesRoot ? join(resourcesRoot, 'workspace-templates', 'ti-mspm0g3507-foundations') : resolve('resources/workspace-templates/ti-mspm0g3507-foundations'),
    templateVersion: 'sdk-2.11.00.07',
    firmwareBaselineId: 'ti-mspm0g3507-sdk-2.11.00.07',
    baselineCommit: '2110000700000000000000000000000000000000',
    edition: EDITION_PROFILES['ti-mspm0-foundations'], sandboxTemplates,
    sandboxStartupSource: join(toolchain.sdkRoot, 'source', 'ti', 'devices', 'msp', 'm0p', 'startup_system_files', 'gcc', 'startup_mspm0g350x_gcc.c')
  })
  await workspaces.initialize()
  for (const projectType of [undefined, 'sdk-empty', 'pony'] as const) {
    const workspace = await workspaces.create({ projectType, name: `TI ${projectType ?? 'LED'} Golden Project`, studentDisplayName: 'Smoke Test' })
    const rejectWch: CandidateBuilder = { async build() { throw new Error('TI candidate incorrectly entered WCH builder') } }
    const candidates = new CandidateService({
      rootDir: root, workspaces,
      builder: new PlatformCandidateBuildService(rejectWch, new TiMspm0CandidateBuildService(toolchain, join(root, 'candidate-artifacts')))
    })
    await candidates.initialize()
    let candidate = await candidates.openManualDraft(workspace.id)
    const candidateMain = (await candidates.listStudentCodeFiles(workspace.id, candidate.id)).find((file) => file.path === 'src/main.c')
    if (!candidateMain?.editable) throw new Error('TI candidate main.c is not editable')
    await candidates.writeManualDraft(candidate.id, candidateMain.path, `${candidateMain.content}\n/* TI Candidate Arm GCC smoke */\n`)
    candidate = await candidates.validate(candidate.id)
    if (candidate.state !== 'review_ready') throw new Error(candidate.error ?? 'TI candidate validation failed')
    candidate = await candidates.build(candidate.id)
    if (candidate.state !== 'build_passed' || !candidate.buildProof?.checks.some((check) => check.id === 'ti-project-sources') || /WCH/i.test(candidate.buildProof.compiler)) throw new Error(candidate.error ?? 'TI candidate did not use Arm GCC')
    candidate = await candidates.apply(candidate.id)
    if (candidate.state !== 'applied') throw new Error(candidate.error ?? 'TI candidate apply failed')
    console.log('TI MSPM0 candidate SysConfig + Arm GCC preflight passed')
    const build = new TiMspm0BuildService(toolchain, workspaces, join(root, 'artifacts'))
    await build.initialize()
    const result = await build.build({ workspaceId: workspace.id })
    if (result.state !== 'completed') throw new Error(result.error ?? 'TI MSPM0 build failed')
    if (resourcesRoot && (!status.bundled || [toolchain.sdkRoot, toolchain.sysconfigRoot, toolchain.gccRoot, toolchain.openocdRoot].some((path) => !path.startsWith(join(resourcesRoot, 'toolchains', 'ti-mspm0'))))) {
      throw new Error('Packaged TI smoke escaped the managed toolchain root')
    }
    console.log(`TI MSPM0 golden build passed: ${result.artifacts.find((item) => item.kind === 'elf')?.path}`)
    console.log(`Flash ${result.size!.text + result.size!.data} bytes; RAM ${result.size!.data + result.size!.bss} bytes`)
    if (!['elf', 'hex', 'bin', 'map'].every(kind => result.artifacts.some(artifact => artifact.kind === kind))) throw new Error('TI smoke missing build artifacts')
    if (projectType === 'sdk-empty') {
      const generated = join(await workspaces.getProjectRootForMain(workspace.id), 'generated', 'ti_msp_dl_config.h')
      const marker = '\n/* student-generated-header-preservation */\n'
      await writeFile(generated, await readFile(generated, 'utf8') + marker)
      const rebuilt = await build.build({ workspaceId: workspace.id })
      if (rebuilt.state !== 'completed' || !(await readFile(generated, 'utf8')).includes(marker)) throw new Error('TI generated code preservation failed')
    }
    console.log(`TI_PROJECT_SMOKE_OK template=${workspace.templateId}`)
    if (resourcesRoot) console.log(`TI_MSPM0_PACKAGED_SMOKE_OK resources=${resourcesRoot}`)
    if (process.argv.includes('--flash')) {
      if (projectType) continue
      const flash = await new TiMspm0FlashService(toolchain, build).flashCurrent(workspace.id)
      if (flash.state !== 'completed') throw new Error(flash.error ?? 'TI MSPM0 flash failed')
      console.log('TI MSPM0 CMSIS-DAP flash, verify and reset passed')
    }
  }
} finally {
  if (!process.argv.includes('--keep')) await rm(root, { recursive: true, force: true })
  else console.log(`Kept smoke workspace: ${root}`)
}
