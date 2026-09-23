import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EDITION_PROFILES } from '../../shared/edition'
import { CandidateBuildService } from './candidate-build-service'
import { CandidateService } from './candidate-service'
import { CourseService } from './course-service'
import { FirmwareBaselineResolver } from './firmware-baseline-resolver'
import { FirmwareBaselineService } from './firmware-baseline-service'
import { FirmwareBuildService } from './firmware-build-service'
import { ProjectExplorerService } from './project-explorer-service'
import { ToolchainService } from './toolchain-service'
import { WorkspaceService } from './workspace-service'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
const toolchain = new ToolchainService(repoRoot)
const canRun = existsSync(join(repoRoot, 'vendor', 'wch', 'Toolchain', 'RISC-V Embedded GCC12'))

describe('Pony & RHS Multi-Baseline Integration', () => {
  let sandbox: string | undefined

  afterEach(async () => {
    if (sandbox) await rm(sandbox, { recursive: true, force: true })
  })

  it('resolves distinct baselines, student templates, and project explorer structures for sandbox vs lesson workspaces', async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'multi-baseline-structure-'))

    const rhsBaseline = new FirmwareBaselineService({
      manifestPath: join(repoRoot, 'resources', 'firmware-baselines', 'ch32v203-rhs', 'active.json'),
      developmentSourceRoot: join(repoRoot, 'firmware', 'ch32v203-baseline')
    })
    const ponyBaseline = new FirmwareBaselineService({
      manifestPath: join(repoRoot, 'resources', 'firmware-baselines', 'ch32v203-pony', 'active.json'),
      developmentSourceRoot: join(repoRoot, 'firmware', 'v2.5_沁恒小马例程')
    })
    const rhsManifest = await rhsBaseline.getManifest()
    const ponyManifest = await ponyBaseline.getManifest()

    const resolver = new FirmwareBaselineResolver({
      staticRoot: join(repoRoot, 'resources'),
      isPackaged: false
    })
    resolver.register(rhsManifest.id, rhsBaseline)
    resolver.register(ponyManifest.id, ponyBaseline)

    const ponyTemplateRoot = join(repoRoot, 'resources', 'workspace-templates', 'ch32v203-pony', '0.2.5')
    const rhsTemplateRoot = join(repoRoot, 'resources', 'workspace-templates', 'ch32v203-mcu-lessons', '01-first-program-on-chip')

    const workspaces = new WorkspaceService({
      rootDir: sandbox,
      templateRoot: rhsTemplateRoot,
      templateVersion: rhsManifest.source.expectedCommit.slice(0, 7),
      firmwareBaselineId: rhsManifest.id,
      baselineCommit: rhsManifest.source.expectedCommit,
      edition: EDITION_PROFILES['mcu-foundations'],
      sandboxDefaults: {
        templateRoot: ponyTemplateRoot,
        templateVersion: ponyManifest.source.expectedCommit.slice(0, 7),
        templateId: 'ch32v203-pony',
        firmwareBaselineId: ponyManifest.id,
        baselineCommit: ponyManifest.source.expectedCommit
      }
    })
    await workspaces.initialize()

    // 1. Create Pony free-practice sandbox
    const sandboxWs = await workspaces.create({ studentDisplayName: '小明' })
    expect(sandboxWs.workspacePurpose).toBe('mcu-sandbox')
    expect(sandboxWs.firmwareBaselineId).toBe('ch32v203-pony-v25')
    expect(sandboxWs.templateId).toBe('ch32v203-pony')

    // 2. Create RHS lesson attempt
    const courses = new CourseService({
      rootDir: join(repoRoot, 'resources', 'courses', 'mcu-foundations'),
      templatesRoot: join(repoRoot, 'resources', 'workspace-templates', 'ch32v203-mcu-lessons'),
      includeDrafts: true
    })
    const spec = await courses.getWorkspaceCreationSpec('ch32v203-foundations', 'first-program-on-chip')
    const lessonWs = await workspaces.createLessonAttempt({
      courseId: 'ch32v203-foundations',
      lessonId: 'first-program-on-chip',
      studentDisplayName: '小红'
    }, spec)
    expect(lessonWs.workspacePurpose).toBe('mcu-lesson-attempt')
    expect(lessonWs.firmwareBaselineId).toBe('ch32v203-rhs-baseline')
    expect(lessonWs.templateId).toBe('first-program-on-chip')

    // 3. ProjectExplorer snapshots
    const candidates = new CandidateService({
      rootDir: sandbox,
      workspaces,
      builder: new CandidateBuildService(toolchain, join(sandbox, 'candidate-cache'))
    })
    await candidates.initialize()
    const explorer = new ProjectExplorerService(workspaces, candidates, resolver)

    const ponySnapshot = await explorer.getSnapshot(sandboxWs.id)
    expect(ponySnapshot.rootLabel).toContain('Pony Firmware')
    expect(ponySnapshot.baselineId).toBe('ch32v203-pony-v25')
    const ponyExperimentNode = ponySnapshot.nodes.find((n) => n.displayPath === 'App/Src/experiment.c')
    expect(ponyExperimentNode).toMatchObject({ origin: 'lesson-overlay', access: 'editable' })
    const ponyControlHeader = ponySnapshot.nodes.find((n) => n.displayPath === 'Core/Inc/student_control.h')
    expect(ponyControlHeader).toMatchObject({ origin: 'firmware-baseline', access: 'read-only' })

    const rhsSnapshot = await explorer.getSnapshot(lessonWs.id)
    expect(rhsSnapshot.rootLabel).toContain('RHS Firmware')
    expect(rhsSnapshot.baselineId).toBe('ch32v203-rhs-baseline')
    const rhsExperimentNode = rhsSnapshot.nodes.find((n) => n.displayPath === 'App/Src/experiment.c')
    expect(rhsExperimentNode).toMatchObject({ origin: 'lesson-overlay', access: 'editable' })
  })

  it.runIf(canRun)('completes full Candidate build, apply, and Firmware build on Pony baseline, with stale detection', async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'pony-full-build-'))

    const ponyBaseline = new FirmwareBaselineService({
      manifestPath: join(repoRoot, 'resources', 'firmware-baselines', 'ch32v203-pony', 'active.json'),
      developmentSourceRoot: join(repoRoot, 'firmware', 'v2.5_沁恒小马例程')
    })
    const ponyManifest = await ponyBaseline.getManifest()

    const rhsBaseline = new FirmwareBaselineService({
      manifestPath: join(repoRoot, 'resources', 'firmware-baselines', 'ch32v203-rhs', 'active.json'),
      developmentSourceRoot: join(repoRoot, 'firmware', 'ch32v203-baseline')
    })
    const rhsManifest = await rhsBaseline.getManifest()

    const resolver = new FirmwareBaselineResolver({
      staticRoot: join(repoRoot, 'resources'),
      isPackaged: false
    })
    resolver.register(ponyManifest.id, ponyBaseline)
    resolver.register(rhsManifest.id, rhsBaseline)

    const ponyTemplateRoot = join(repoRoot, 'resources', 'workspace-templates', 'ch32v203-pony', '0.2.5')

    const workspaces = new WorkspaceService({
      rootDir: sandbox,
      templateRoot: ponyTemplateRoot,
      templateVersion: ponyManifest.source.expectedCommit.slice(0, 7),
      firmwareBaselineId: ponyManifest.id,
      baselineCommit: ponyManifest.source.expectedCommit,
      edition: EDITION_PROFILES['mcu-foundations'],
      sandboxDefaults: {
        templateRoot: ponyTemplateRoot,
        templateVersion: ponyManifest.source.expectedCommit.slice(0, 7),
        templateId: 'ch32v203-pony',
        firmwareBaselineId: ponyManifest.id,
        baselineCommit: ponyManifest.source.expectedCommit
      }
    })
    await workspaces.initialize()

    const workspace = await workspaces.create({ studentDisplayName: '小明' })

    const candidateBuilder = new CandidateBuildService(toolchain, join(sandbox, 'candidate-cache'))
    const candidates = new CandidateService({
      rootDir: sandbox,
      workspaces,
      builder: candidateBuilder
    })
    await candidates.initialize()

    // 1. Candidate workflow: modify App/Src/experiment.c to call student_control API
    const draft = await candidates.openManualDraft(workspace.id)
    const originalExperiment = (await candidates.listStudentCodeFiles(workspace.id, draft.id)).find((f) => f.path === 'App/Src/experiment.c')!
    const modifiedCode = `#include "experiment.h"

void Experiment_Init(void) {
    /* test pony candidate build */
}

void Experiment_Update(const student_control_input_t *input, student_control_output_t *output) {
    if (!output) return;
    output->action = STUDENT_ACTION_STAND;
    output->turn_strength = 20U;
    if (input && input->line_valid) {
        output->action = STUDENT_ACTION_WALK;
    }
}
`
    await candidates.writeManualDraft(draft.id, originalExperiment.path, modifiedCode)

    const validation = await candidates.validate(draft.id)
    expect(validation.state).toBe('review_ready')

    const buildState = await candidates.build(draft.id)
    expect(buildState.state, `Candidate build error: ${buildState.error}`).toBe('build_passed')

    const applyState = await candidates.apply(draft.id)
    expect(applyState.state).toBe('applied')

    // 2. Full Firmware Build using FirmwareBaselineResolver
    const firmware = new FirmwareBuildService(toolchain, {
      baseline: resolver,
      workspaces,
      outputBase: join(sandbox, 'firmware-output')
    })
    await firmware.initialize()

    const buildResult = await firmware.build({ workspaceId: workspace.id })
    expect(buildResult.state, `${buildResult.error}\n${buildResult.logs.join('\n')}`).toBe('completed')
    expect(buildResult.proof?.firmwareBaselineId).toBe('ch32v203-pony-v25')
    expect(buildResult.artifacts.map((a) => a.kind).sort()).toEqual(['bin', 'elf', 'hex', 'map'])
    expect(buildResult.artifacts.map((a) => a.name).sort()).toEqual(['RobotDog.bin', 'RobotDog.elf', 'RobotDog.hex', 'RobotDog.map'])

    // 3. requireCurrentArtifact succeeds
    const binArtifact = await firmware.requireCurrentArtifact(workspace.id, 'bin')
    expect(binArtifact.name).toBe('RobotDog.bin')
    expect(binArtifact.sha256).toMatch(/^[a-f0-9]{64}$/)

    // 4. Stale detection:
    // (a) Artifact tampering is rejected
    await writeFile(binArtifact.path, 'tampered')
    await expect(firmware.requireCurrentArtifact(workspace.id, 'bin')).rejects.toThrow('固件产物校验失败')

    // (b) Applying a new candidate changes workspace head commit, making previous build proof stale
    const secondDraft = await candidates.openManualDraft(workspace.id)
    await candidates.writeManualDraft(secondDraft.id, 'App/Src/experiment.c', modifiedCode.replace('20U', '30U'))
    await candidates.validate(secondDraft.id)
    await candidates.build(secondDraft.id)
    await candidates.apply(secondDraft.id)
    await expect(firmware.requireCurrentArtifact(workspace.id, 'bin')).rejects.toThrow('学生代码或固件基线已经变化')
  }, 180_000)
})
