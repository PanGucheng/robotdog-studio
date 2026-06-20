import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FirmwareBaselineService } from './firmware-baseline-service'
import { FirmwareBuildService } from './firmware-build-service'
import { ToolchainService } from './toolchain-service'
import { WorkspaceService } from './workspace-service'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
const firmwareRoot = process.env.ROBOTDOG_FIRMWARE_ROOT ?? 'D:\\RobotDog\\ch32v203-robot-dog'
const canRun = process.env.ROBOTDOG_RUN_FIRMWARE_INTEGRATION === '1' && existsSync(firmwareRoot)

describe('FirmwareBuildService integration', () => {
  let sandbox: string | undefined

  afterEach(async () => { if (sandbox) await rm(sandbox, { recursive: true, force: true }) })

  it.runIf(canRun)('builds a clean staged firmware with the student overlay', async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'robotdog-full-build-测试 path-'))
    const baseline = new FirmwareBaselineService({
      manifestPath: join(repoRoot, 'resources', 'firmware-baselines', 'ch32v203-robotdog', 'provisional-0858d82', 'robotdog.firmware.json'),
      developmentSourceRoot: firmwareRoot
    })
    const manifest = await baseline.getManifest()
    const workspaces = new WorkspaceService({
      rootDir: join(sandbox, '用户 数据'),
      templateRoot: join(repoRoot, 'resources', 'workspace-templates', 'ch32v203-robotdog', '2026.06'),
      firmwareBaselineId: manifest.id,
      baselineCommit: manifest.source.expectedCommit
    })
    const workspace = await workspaces.create({ studentDisplayName: '测试同学' })
    const service = new FirmwareBuildService(new ToolchainService(repoRoot), { baseline, workspaces, outputBase: join(sandbox, '固件 产物') })
    const result = await service.build({ workspaceId: workspace.id })

    expect(result.state, result.error).toBe('completed')
    expect(result.artifacts.map((artifact) => artifact.kind).sort()).toEqual(['bin', 'elf', 'hex', 'map'])
    expect(result.artifacts.every((artifact) => artifact.sha256?.match(/^[a-f0-9]{64}$/))).toBe(true)
    expect(result.proof).toMatchObject({ workspaceId: workspace.id, firmwareBaselineId: manifest.id, releaseEligible: false })
    expect(result.size?.dec).toBeGreaterThan(0)

    const cached = await service.build({ workspaceId: workspace.id })
    expect(cached.state).toBe('completed')
    expect(cached.logs.join(' ')).toContain('哈希校验')
  }, 120_000)
})
