import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TiMspm0ToolchainService } from './ti-mspm0-toolchain-service'

describe('TiMspm0ToolchainService path resolution', () => {
  it('uses the managed package layout when its manifest is present', async () => {
    const resources = await mkdtemp(join(tmpdir(), 'robotdog-ti-resources-'))
    const root = join(resources, 'toolchains', 'ti-mspm0')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'manifest.json'), '{}')
    const service = new TiMspm0ToolchainService({ resourcesPath: resources, environment: { ROBOTDOG_TI_MSPM0_SDK_ROOT: 'X:\\external-sdk' } })
    expect(service.bundledRoot).toBe(root)
    expect(service.sdkRoot).toBe(join(root, 'sdk'))
    expect(service.gccRoot).toBe(join(root, 'gcc'))
    expect(service.sysconfigRoot).toBe(join(root, 'sysconfig'))
    expect(service.openocdRoot).toBe(join(root, 'openocd'))
  })

  it('keeps environment overrides available for development without a package manifest', () => {
    const service = new TiMspm0ToolchainService({ resourcesPath: '', environment: { ROBOTDOG_TI_GCC_ROOT: 'X:\\arm-gcc' } })
    expect(service.bundledRoot).toBeUndefined()
    expect(service.gccRoot).toBe('X:\\arm-gcc')
  })
})
