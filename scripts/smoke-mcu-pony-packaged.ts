import { mkdtemp, rm, stat, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { EDITION_PROFILES } from '../src/shared/edition'
import { CandidateService } from '../src/main/services/candidate-service'
import { CandidateBuildService } from '../src/main/services/candidate-build-service'
import { FirmwareBaselineService } from '../src/main/services/firmware-baseline-service'
import { FirmwareBaselineResolver } from '../src/main/services/firmware-baseline-resolver'
import { FirmwareBuildService } from '../src/main/services/firmware-build-service'
import { ToolchainService } from '../src/main/services/toolchain-service'
import { WorkspaceService } from '../src/main/services/workspace-service'

const resourcesIndex = process.argv.indexOf('--resources-root')
const resourcesRoot = resourcesIndex >= 0 ? resolve(process.argv[resourcesIndex + 1] ?? '') : undefined
if (resourcesRoot) {
  process.resourcesPath = resourcesRoot
}

const root = await mkdtemp(join(tmpdir(), 'robotdog-pony-packaged-smoke-'))

try {
  const ponyBaselineDir = resourcesRoot
    ? join(resourcesRoot, 'firmware-baselines', 'ch32v203-pony', 'current', 'source')
    : resolve('firmware/v2.5_沁恒小马例程')

  const ponyTemplateDir = resourcesRoot
    ? join(resourcesRoot, 'workspace-templates', 'ch32v203-pony', '0.2.5')
    : resolve('resources/workspace-templates/ch32v203-pony/0.2.5')

  console.log(`Checking Pony baseline directory: ${ponyBaselineDir}`)
  const requiredBaselineFiles = [
    'CMakeLists.txt',
    'CMakePresets.json',
    'pony.firmware.json',
    'User/main.c',
    'Core/Src/student_control.c',
    'Core/Inc/student_control.h',
    'Startup/startup_ch32v20x_D6.S',
    'Ld/Link.ld'
  ]
  for (const item of requiredBaselineFiles) {
    const p = join(ponyBaselineDir, ...item.split('/'))
    if (!(await stat(p).then((s) => s.isFile(), () => false))) {
      throw new Error(`Pony baseline missing required file: ${item} (${p})`)
    }
  }

  console.log(`Checking Pony template directory: ${ponyTemplateDir}`)
  const requiredTemplateFiles = [
    'App/Src/experiment.c',
    'App/Inc/experiment.h',
    'Core/Src/student_control.c',
    'Core/Inc/student_control.h',
    'student-config/line-following.yaml'
  ]
  for (const item of requiredTemplateFiles) {
    const p = join(ponyTemplateDir, ...item.split('/'))
    if (!(await stat(p).then((s) => s.isFile(), () => false))) {
      throw new Error(`Pony template missing required file: ${item} (${p})`)
    }
  }

  const toolchain = new ToolchainService(resolve('.'))
  const toolStatus = await toolchain.getStatus()
  if (!toolStatus.gcc.ok || !toolStatus.objcopy.ok || !toolStatus.size.ok) {
    throw new Error(`WCH Toolchain not ready: gcc=${toolStatus.gcc.ok}, objcopy=${toolStatus.objcopy.ok}, size=${toolStatus.size.ok}`)
  }

  const staticRoot = resourcesRoot ? resourcesRoot : resolve('resources')
  const resolver = new FirmwareBaselineResolver({
    staticRoot,
    isPackaged: Boolean(resourcesRoot)
  })

  // In non-packaged development mode, ensure pony baseline resolves to local source
  if (!resourcesRoot) {
    const devPonyBaseline = new FirmwareBaselineService({
      manifestPath: join(resolve('resources'), 'firmware-baselines', 'ch32v203-pony', 'active.json'),
      developmentSourceRoot: ponyBaselineDir
    })
    resolver.register('ch32v203-pony-v25', devPonyBaseline)
  }

  const activeJsonPath = join(staticRoot, 'firmware-baselines', 'ch32v203-pony', 'active.json')
  const activeJson = JSON.parse(await readFile(activeJsonPath, 'utf8'))
  const expectedCommit = activeJson.activeCommit ?? '797dd6a0a53277197a7c54db2bb4a37debd0a9b0'
  const baselineId = activeJson.id ?? 'ch32v203-pony-v25'

  const workspaces = new WorkspaceService({
    rootDir: root,
    templateRoot: ponyTemplateDir,
    templateVersion: expectedCommit.slice(0, 7),
    firmwareBaselineId: baselineId,
    baselineCommit: expectedCommit,
    edition: EDITION_PROFILES['mcu-foundations'],
    sandboxDefaults: {
      templateRoot: ponyTemplateDir,
      templateVersion: expectedCommit.slice(0, 7),
      templateId: 'ch32v203-pony',
      firmwareBaselineId: baselineId,
      baselineCommit: expectedCommit
    }
  })
  await workspaces.initialize()

  const workspace = await workspaces.create({ name: 'Pony Packaged Smoke Project', studentDisplayName: 'Smoke Student' })
  if (workspace.firmwareBaselineId !== baselineId || workspace.workspacePurpose !== 'mcu-sandbox') {
    throw new Error(`Workspace setup invalid: baseline=${workspace.firmwareBaselineId}, purpose=${workspace.workspacePurpose}`)
  }

  const candidateBuilder = new CandidateBuildService(toolchain, join(root, 'candidate-cache'))
  const candidates = new CandidateService({
    rootDir: root,
    workspaces,
    builder: candidateBuilder
  })
  await candidates.initialize()

  const draft = await candidates.openManualDraft(workspace.id)
  const originalExperiment = (await candidates.listStudentCodeFiles(workspace.id, draft.id)).find((f) => f.path === 'App/Src/experiment.c')
  if (!originalExperiment || !originalExperiment.editable) {
    throw new Error('Pony App/Src/experiment.c missing or not editable')
  }

  const modifiedCode = `#include "experiment.h"

void Experiment_Init(void) {
    /* test pony packaged candidate build */
}

void Experiment_Update(const student_control_input_t *input, student_control_output_t *output) {
    if (!output) return;
    output->action = STUDENT_ACTION_STAND;
    output->turn_strength = 15U;
    if (input && input->line_valid) {
        output->action = STUDENT_ACTION_WALK;
    }
}
`
  await candidates.writeManualDraft(draft.id, originalExperiment.path, modifiedCode)

  const validation = await candidates.validate(draft.id)
  if (validation.state !== 'review_ready') {
    throw new Error(`Candidate validation failed: ${validation.error}`)
  }

  const buildState = await candidates.build(draft.id)
  if (buildState.state !== 'build_passed') {
    throw new Error(`Candidate build failed: ${buildState.error}`)
  }

  const applyState = await candidates.apply(draft.id)
  if (applyState.state !== 'applied') {
    throw new Error(`Candidate apply failed: ${applyState.error}`)
  }
  console.log('Pony candidate workflow (validate, build, apply) passed')

  const firmware = new FirmwareBuildService(toolchain, {
    baselineResolver: resolver,
    workspaces,
    outputBase: join(root, 'firmware-output')
  })
  await firmware.initialize()

  const buildSnapshot = await firmware.build({ workspaceId: workspace.id })
  if (buildSnapshot.state !== 'completed') {
    throw new Error(`Firmware build failed: ${buildSnapshot.error ?? 'unknown error'}`)
  }

  const elf = buildSnapshot.artifacts.find((a) => a.kind === 'elf')
  const hex = buildSnapshot.artifacts.find((a) => a.kind === 'hex')
  const bin = buildSnapshot.artifacts.find((a) => a.kind === 'bin')
  const map = buildSnapshot.artifacts.find((a) => a.kind === 'map')
  if (!elf || !hex || !bin || !map) {
    throw new Error(`Firmware build missing artifacts: elf=${Boolean(elf)}, hex=${Boolean(hex)}, bin=${Boolean(bin)}, map=${Boolean(map)}`)
  }
  for (const artifact of [elf, hex, bin, map]) {
    if (!(await stat(artifact.path).then((s) => s.isFile(), () => false))) {
      throw new Error(`Artifact file does not exist on disk: ${artifact.path}`)
    }
  }

  const size = buildSnapshot.size
  if (!size || size.text <= 0) {
    throw new Error('Firmware size output missing or invalid')
  }

  console.log(`Pony packaged build passed: ${elf.path}`)
  console.log(`Flash: ${size.text + size.data} bytes; RAM: ${size.data + size.bss} bytes`)
  console.log('PONY_PACKAGED_SMOKE_OK')
} finally {
  if (!process.argv.includes('--keep')) {
    await rm(root, { recursive: true, force: true })
  } else {
    console.log(`Kept smoke sandbox: ${root}`)
  }
}
