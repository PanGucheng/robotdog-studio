import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EDITION_PROFILES } from '../../shared/edition'
import type { CandidateBuilder } from './candidate-build-service'
import { CandidateService } from './candidate-service'
import { FirmwareBaselineService } from './firmware-baseline-service'
import { ProjectExplorerService } from './project-explorer-service'
import { WorkspaceService } from './workspace-service'

const builder: CandidateBuilder = {
  async build(input) {
    return {
      candidateId: input.candidateId, sourceTreeHash: input.sourceTreeHash, diffHash: input.diffHash,
      compiler: 'test', objectSha256: '1'.repeat(64), completedAt: new Date().toISOString(), checks: []
    }
  }
}

describe('ProjectExplorerService', () => {
  let sandbox: string
  let dataRoot: string
  let sourceRoot: string
  let workspaces: WorkspaceService
  let candidates: CandidateService
  let service: ProjectExplorerService
  let workspaceId: string

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'robotdog-explorer-'))
    dataRoot = join(sandbox, 'data')
    const templateRoot = join(sandbox, 'template')
    sourceRoot = join(sandbox, 'baseline')
    for (const root of [templateRoot, sourceRoot]) {
      await mkdir(join(root, 'App', 'Src'), { recursive: true })
      await mkdir(join(root, 'App', 'Inc'), { recursive: true })
      await mkdir(join(root, 'Core', 'Src'), { recursive: true })
      await mkdir(join(root, 'Core', 'Inc'), { recursive: true })
      await writeFile(join(root, 'App', 'Src', 'experiment.c'), 'void Experiment_Init(void) {}\n')
      await writeFile(join(root, 'App', 'Inc', 'experiment.h'), 'void Experiment_Init(void);\n')
      await writeFile(join(root, 'Core', 'Src', 'student_control.c'), 'void StudentControl_Init(void) {}\n')
      await writeFile(join(root, 'Core', 'Inc', 'student_control.h'), 'void StudentControl_Init(void);\n')
    }
    await mkdir(join(sourceRoot, 'User'), { recursive: true })
    await mkdir(join(sourceRoot, 'Peripheral', 'inc'), { recursive: true })
    await mkdir(join(sourceRoot, 'Startup'), { recursive: true })
    await mkdir(join(sourceRoot, 'Ld'), { recursive: true })
    await mkdir(join(sourceRoot, '.git'), { recursive: true })
    await writeFile(join(sourceRoot, 'User', 'main.c'), 'int main(void) { return 0; }\n')
    await writeFile(join(sourceRoot, 'Peripheral', 'inc', 'ch32v20x_gpio.h'), '#pragma once\n')
    await writeFile(join(sourceRoot, 'Startup', 'start.S'), '_start:\n')
    await writeFile(join(sourceRoot, 'Ld', 'Link.ld'), 'MEMORY {}\n')
    await writeFile(join(sourceRoot, 'CMakeLists.txt'), 'project(RobotDog C ASM)\n')
    await writeFile(join(sourceRoot, 'CMakePresets.json'), '{}\n')
    await writeFile(join(sourceRoot, 'robotdog.firmware.json'), '{}\n')
    await writeFile(join(sourceRoot, '.git', 'config'), 'secret\n')
    const cmakeHash = createHash('sha256').update('project(RobotDog C ASM)\n').digest('hex')
    const manifestPath = join(sandbox, 'baseline.json')
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1, id: 'baseline-test', label: '测试基线', status: 'provisional', releaseEligible: false, replacementPolicy: 'test',
      source: { repository: 'test', expectedCommit: 'a'.repeat(40), developmentDefaultRoot: sourceRoot },
      target: { board: 'test', chip: 'CH32V203', startup: 'Startup/start.S', linkerScript: 'Ld/Link.ld', memory: { flashBytes: 65536, ramBytes: 20480, confirmed: true } },
      toolchain: { profile: 'test', arch: 'rv32', abi: 'ilp32', codeModel: 'medlow' },
      build: { includeDirectories: ['Core/Inc'], sources: ['User/main.c', 'Startup/start.S'], cFlags: [], assemblerFlags: [], linkFlags: [] },
      studentOverlay: { source: 'Core/Src/student_control.c', header: 'Core/Inc/student_control.h', configInput: 'App/Src/experiment.c', generatedHeader: 'App/Inc/experiment.h' },
      artifacts: { elf: 'a.elf', hex: 'a.hex', bin: 'a.bin', map: 'a.map' }, integrity: [{ path: 'CMakeLists.txt', sha256: cmakeHash }]
    }))
    const baseline = new FirmwareBaselineService({ manifestPath })
    workspaces = new WorkspaceService({
      rootDir: dataRoot, templateRoot, templateVersion: 'test', firmwareBaselineId: 'baseline-test', baselineCommit: 'a'.repeat(40), edition: EDITION_PROFILES['mcu-foundations']
    })
    await workspaces.initialize()
    workspaceId = (await workspaces.create({ name: '单片机练习', studentDisplayName: '测试同学' })).id
    candidates = new CandidateService({ rootDir: dataRoot, workspaces, builder })
    await candidates.initialize()
    service = new ProjectExplorerService(workspaces, candidates, baseline)
  })

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  })

  it('merges editable lesson files with a read-only baseline and hides internal paths', async () => {
    const snapshot = await service.getSnapshot(workspaceId)
    expect(snapshot).toMatchObject({ baselineAvailable: true, baselineId: 'baseline-test' })
    expect(snapshot.nodes.find((node) => node.displayPath === 'App/Src/experiment.c')).toMatchObject({ origin: 'lesson-overlay', access: 'editable', role: 'student-code' })
    expect(snapshot.nodes.find((node) => node.displayPath === 'User/main.c')).toMatchObject({ origin: 'firmware-baseline', access: 'read-only', role: 'application' })
    expect(snapshot.nodes.some((node) => node.displayPath.includes('.git'))).toBe(false)
  })

  it('reads files only through opaque listed node ids', async () => {
    const snapshot = await service.getSnapshot(workspaceId)
    const editable = snapshot.nodes.find((node) => node.displayPath === 'App/Src/experiment.c')!
    const baseline = snapshot.nodes.find((node) => node.displayPath === 'User/main.c')!
    expect((await service.readFile(workspaceId, editable.id)).content).toContain('Experiment_Init')
    expect((await service.readFile(workspaceId, baseline.id)).content).toContain('main')
    await expect(service.readFile(workspaceId, 'User/main.c')).rejects.toThrow('NODE_INVALID')
    await expect(service.readFile(workspaceId, '0'.repeat(24))).rejects.toThrow('FILE_NOT_FOUND')
  })

  it('marks validated candidate files without exposing baseline files as editable', async () => {
    const draft = await candidates.openManualDraft(workspaceId)
    await candidates.writeManualDraft(draft.id, 'App/Src/experiment.c', 'void Experiment_Init(void) { /* changed */ }\n')
    await candidates.validate(draft.id)
    const snapshot = await service.getSnapshot(workspaceId, draft.id)
    expect(snapshot.nodes.find((node) => node.displayPath === 'App/Src/experiment.c')?.state).toBe('modified')
    expect(snapshot.nodes.find((node) => node.displayPath === 'Ld/Link.ld')?.access).toBe('read-only')
  })
})
