import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SourceFingerprintService } from './source-fingerprint-service'
import { TiMspm0BuildService } from './ti-mspm0-build-service'
import { TiMspm0ToolchainService } from './ti-mspm0-toolchain-service'
import type { WorkspaceService } from './workspace-service'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('rejects an old ELF after an external SysConfig save even when the Git commit did not change', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ti-artifact-freshness-'))
  roots.push(root)
  const project = join(root, 'project')
  await mkdir(project)
  const config = join(project, 'gpio_toggle_output.syscfg')
  await writeFile(config, 'green configuration')
  const elf = join(root, 'firmware.out')
  const bytes = Buffer.from('ELF freshness fixture')
  await writeFile(elf, bytes)
  const artifact = { path: elf, name: 'firmware.out', kind: 'elf', sha256: createHash('sha256').update(bytes).digest('hex') }
  const workspaces = {
    get: async () => ({ platform: 'ti-mspm0', headCommit: 'unchanged-commit' }),
    getProjectRootForMain: async () => project
  } as unknown as WorkspaceService
  const build = new TiMspm0BuildService(new TiMspm0ToolchainService({ resourcesPath: '' }), workspaces, join(root, 'artifacts'))
  Object.assign(build, { snapshot: { state: 'completed', artifacts: [artifact], proof: {
    workspaceId: 'workspace', workspaceCommit: 'unchanged-commit', workspaceSourceHash: await new SourceFingerprintService().calculate(project)
  } } })
  await expect(build.requireCurrentArtifact('workspace', 'elf')).resolves.toMatchObject({ name: 'firmware.out' })
  await writeFile(config, 'green and blue configuration saved by SysConfig GUI')
  await expect(build.requireCurrentArtifact('workspace', 'elf')).rejects.toThrow('代码或 SysConfig 配置已经变化')
})
