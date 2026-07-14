import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FirmwareBaselineService } from './firmware-baseline-service'

describe('FirmwareBaselineService', () => {
  let sandbox: string | undefined

  afterEach(async () => {
    if (sandbox) await rm(sandbox, { recursive: true, force: true })
    sandbox = undefined
  })

  it('validates a provisional baseline without treating it as release ready', async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'robotdog-baseline-测试 path-'))
    const sourceRoot = join(sandbox, '固件 source')
    await mkdir(join(sourceRoot, 'Ld'), { recursive: true })
    await mkdir(join(sourceRoot, 'Startup'), { recursive: true })
    await writeFile(join(sourceRoot, 'main.c'), 'int main(void) { return 0; }\n')
    await writeFile(join(sourceRoot, 'Ld', 'Link.ld'), 'MEMORY {}\n')
    await writeFile(join(sourceRoot, 'Startup', 'start.S'), '_start:\n')
    const mainHash = createHash('sha256').update('int main(void) { return 0; }\n').digest('hex')
    const manifestPath = join(sandbox, 'robotdog.firmware.json')
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1, id: 'test-provisional', label: '测试临时基线', status: 'provisional', releaseEligible: false, replacementPolicy: 'replace later',
      source: { repository: 'test', expectedCommit: 'a'.repeat(40), developmentDefaultRoot: sourceRoot },
      target: { board: 'test', chip: 'test', startup: 'Startup/start.S', linkerScript: 'Ld/Link.ld', memory: { flashBytes: 65536, ramBytes: 20480, confirmed: false } },
      toolchain: { profile: 'test', arch: 'rv32imac', abi: 'ilp32', codeModel: 'medlow' },
      build: { includeDirectories: ['.'], sources: ['main.c', 'Startup/start.S'], cFlags: [], assemblerFlags: [], linkFlags: [] },
      studentOverlay: { source: 'Core/Src/student_control.c', header: 'Core/Inc/student_control.h', configInput: 'student-config/line-following.yaml', generatedHeader: 'Core/Inc/student_config.generated.h' },
      artifacts: { elf: 'RobotDog.elf', hex: 'RobotDog.hex', bin: 'RobotDog.bin', map: 'RobotDog.map' },
      integrity: [{ path: 'main.c', sha256: mainHash }]
    }))

    const service = new FirmwareBaselineService({ manifestPath })
    const status = await service.getStatus()
    expect(status).toMatchObject({ readyForTesting: true, releaseEligible: false, sourceRoot })
    expect(status.warnings.join(' ')).toContain('功能测试')
    expect((await service.requireTestingBaseline()).sourceHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects a modified integrity file', async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'robotdog-baseline-bad-'))
    const sourceRoot = join(sandbox, 'source')
    await mkdir(join(sourceRoot, 'Ld'), { recursive: true })
    await mkdir(join(sourceRoot, 'Startup'), { recursive: true })
    await writeFile(join(sourceRoot, 'main.c'), 'changed\n')
    await writeFile(join(sourceRoot, 'Startup', 'start.S'), '_start:\n')
    const manifestPath = join(sandbox, 'manifest.json')
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1, id: 'bad', label: 'bad', status: 'provisional', releaseEligible: false, replacementPolicy: 'later',
      source: { repository: 'test', expectedCommit: 'b'.repeat(40), developmentDefaultRoot: sourceRoot },
      target: { board: 'test', chip: 'test', startup: 'Startup/start.S', linkerScript: 'Ld/Link.ld', memory: { flashBytes: 1, ramBytes: 1, confirmed: false } },
      toolchain: { profile: 'test', arch: 'rv32', abi: 'ilp32', codeModel: 'medlow' },
      build: { includeDirectories: ['.'], sources: ['main.c'], cFlags: [], assemblerFlags: [], linkFlags: [] },
      studentOverlay: { source: 'student.c', header: 'student.h', configInput: 'config.yaml', generatedHeader: 'generated.h' },
      artifacts: { elf: 'a.elf', hex: 'a.hex', bin: 'a.bin', map: 'a.map' },
      integrity: [{ path: 'main.c', sha256: '0'.repeat(64) }]
    }))
    const status = await new FirmwareBaselineService({ manifestPath }).getStatus()
    expect(status.readyForTesting).toBe(false)
    expect(status.errors.join(' ')).toContain('哈希')
  })

  it('uses packaged source root for a dynamic schema 2 baseline', async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'robotdog-baseline-live-'))
    const activeDir = join(sandbox, 'firmware-baselines', 'ch32v203-robotdog')
    const snapshotDir = join(activeDir, 'snapshots', 'c0ffee0')
    const packagedSourceRoot = join(activeDir, 'current', 'source')
    await mkdir(snapshotDir, { recursive: true })
    await mkdir(join(packagedSourceRoot, 'Core', 'Src'), { recursive: true })
    await mkdir(join(packagedSourceRoot, 'Core', 'Inc'), { recursive: true })
    await mkdir(join(packagedSourceRoot, 'student-config'), { recursive: true })
    await writeFile(join(packagedSourceRoot, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.20)\n')
    await writeFile(join(packagedSourceRoot, 'CMakePresets.json'), '{}\n')
    await writeFile(join(packagedSourceRoot, 'robotdog.firmware.json'), '{}\n')
    await writeFile(join(packagedSourceRoot, 'Core', 'Src', 'student_control.c'), 'void student_control(void) {}\n')
    await writeFile(join(packagedSourceRoot, 'Core', 'Inc', 'student_control.h'), '#pragma once\n')
    await writeFile(join(packagedSourceRoot, 'student-config', 'line-following.yaml'), 'turn_strength: 18\nline_target: 64\n')
    await writeFile(join(snapshotDir, 'robotdog.firmware.json'), JSON.stringify({
      board: 'robotdog',
      chip: 'CH32V203C8T6',
      memory: { flashBytes: 65536, ramBytes: 20480 },
      hardwareStatus: { mcuConfirmed: true },
      studentOverlay: {
        source: 'Core/Src/student_control.c',
        header: 'Core/Inc/student_control.h',
        configInput: 'student-config/line-following.yaml',
        generatedHeader: 'Core/Inc/student_config.generated.h'
      }
    }))
    const activePath = join(activeDir, 'active.json')
    await writeFile(activePath, JSON.stringify({
      schemaVersion: 2,
      activeCommit: 'c'.repeat(40),
      shortCommit: 'c0ffee0',
      verifiedFirmwareManifest: 'snapshots/c0ffee0/robotdog.firmware.json',
      remote: { url: 'https://example.invalid/robotdog.git' }
    }))

    const status = await new FirmwareBaselineService({ manifestPath: activePath, packagedSourceRoot }).getStatus()
    expect(status.sourceRoot).toBe(packagedSourceRoot)
    expect(status.readyForTesting).toBe(true)
    expect(status.errors).toEqual([])
  })
})
