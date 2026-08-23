import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EDITION_PROFILES } from '../../shared/edition'
import { CandidateBuildService } from './candidate-build-service'
import { CandidateService } from './candidate-service'
import { CourseService } from './course-service'
import { FirmwareBaselineService } from './firmware-baseline-service'
import { FirmwareBuildService } from './firmware-build-service'
import { ToolchainService } from './toolchain-service'
import { WorkspaceService } from './workspace-service'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
const toolchain = new ToolchainService(repoRoot)
const canRun = existsSync(join(repoRoot, 'vendor', 'wch', 'Toolchain', 'RISC-V Embedded GCC12'))

describe('RHS Lesson 01 integration', () => {
  let sandbox: string | undefined
  afterEach(async () => { if (sandbox) await rm(sandbox, { recursive: true, force: true }) })

  it.runIf(canRun)('creates a draft attempt and completes Candidate, Apply, and Firmware Build', async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'rhs-lesson-01-'))
    const baseline = new FirmwareBaselineService({
      manifestPath: join(repoRoot, 'resources', 'firmware-baselines', 'ch32v203-rhs', 'active.json'),
      developmentSourceRoot: join(repoRoot, 'firmware', 'ch32v203-baseline')
    })
    const manifest = await baseline.getManifest()
    const courses = new CourseService({
      rootDir: join(repoRoot, 'resources', 'courses', 'mcu-foundations'),
      templatesRoot: join(repoRoot, 'resources', 'workspace-templates', 'ch32v203-mcu-lessons'),
      includeDrafts: true
    })
    const spec = await courses.getWorkspaceCreationSpec('ch32v203-foundations', 'first-program-on-chip')
    const workspaces = new WorkspaceService({
      rootDir: sandbox,
      templateRoot: spec.templateRoot,
      templateVersion: spec.templateVersion,
      firmwareBaselineId: manifest.id,
      baselineCommit: manifest.source.expectedCommit,
      edition: EDITION_PROFILES['mcu-foundations']
    })
    const workspace = await workspaces.createLessonAttempt({
      courseId: 'ch32v203-foundations', lessonId: 'first-program-on-chip', studentDisplayName: '课程作者'
    }, spec)
    expect(await readFile(join(spec.templateRoot, 'App', 'Inc', 'rhs_teaching_platform.h'), 'utf8'))
      .toBe(await readFile(join(repoRoot, 'firmware', 'ch32v203-baseline', 'Teaching', 'Inc', 'rhs_teaching_platform.h'), 'utf8'))
    const candidates = new CandidateService({
      rootDir: sandbox, workspaces,
      builder: new CandidateBuildService(toolchain, join(sandbox, 'candidate-cache'))
    })
    await candidates.initialize()
    const draft = await candidates.openManualDraft(workspace.id)
    const experiment = (await candidates.listStudentCodeFiles(workspace.id, draft.id)).find((file) => file.path === 'App/Src/experiment.c')!
    await candidates.writeManualDraft(draft.id, experiment.path, experiment.content.replace('500U', '1000U'))
    expect((await candidates.validate(draft.id)).state).toBe('review_ready')
    expect((await candidates.build(draft.id)).state).toBe('build_passed')
    expect((await candidates.apply(draft.id)).state).toBe('applied')
    expect(await readFile(join(await workspaces.getProjectRootForMain(workspace.id), 'App', 'Src', 'experiment.c'), 'utf8')).toContain('1000U')

    const firmware = new FirmwareBuildService(toolchain, { baseline, workspaces, outputBase: join(sandbox, 'firmware') })
    await firmware.initialize()
    const result = await firmware.build({ workspaceId: workspace.id })
    expect(result.state, `${result.error}\n${result.logs.join('\n')}`).toBe('completed')
    expect(result.artifacts.map((artifact) => artifact.kind).sort()).toEqual(['bin', 'elf', 'hex', 'map'])
    expect(result.proof?.baselineSourceHash).toMatch(/^[a-f0-9]{64}$/)
  }, 120_000)
})
