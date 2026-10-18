import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EDITION_PROFILES } from '../../shared/edition'
import { WorkspaceService } from './workspace-service'
import { FirmwareBaselineService } from './firmware-baseline-service'
import { FirmwareBaselineResolver } from './firmware-baseline-resolver'
import { CandidateService } from './candidate-service'
import { ProjectExplorerService } from './project-explorer-service'
import { FirmwareBuildService } from './firmware-build-service'
import { ToolchainService } from './toolchain-service'
import { TiMspm0ToolchainService } from './ti-mspm0-toolchain-service'
import { TiMspm0BuildService } from './ti-mspm0-build-service'

const repo = resolve(import.meta.dirname, '../../..')
const cases = [
  ['mcu-foundations', 'sdk-empty', 'ch32v203-sdk-empty'],
  ['ti-mspm0-foundations', 'sdk-empty', 'ti-mspm0g3507-sdk-empty'],
  ['ti-mspm0-foundations', 'pony', 'ti-mspm0g3507-pony']
] as const

describe('independent sandbox project templates', () => {
  it.each(cases)('%s / %s copies the complete selected project, reopens and builds new modules', async (editionId, projectType, directory) => {
    const root = await mkdtemp(join(tmpdir(), 'rh-template-'))
    try {
      const templateRoot = join(repo, 'resources/workspace-templates', directory)
      const baseline = new FirmwareBaselineService({ manifestPath: join(repo, 'resources/firmware-baselines', directory, 'active.json'), developmentSourceRoot: templateRoot })
      const manifest = await baseline.getManifest()
      expect((await baseline.getStatus()).readyForTesting).toBe(true)
      const profile = { templateRoot, templateId: directory, templateVersion: '1', firmwareBaselineId: manifest.id, baselineCommit: manifest.source.expectedCommit }
      const options = { rootDir: root, templateRoot, edition: EDITION_PROFILES[editionId], sandboxTemplates: { [projectType]: profile }, sandboxSourceResolver: async () => { throw new Error('Independent templates must not merge a different baseline') } }
      const workspaces = new WorkspaceService(options)
      const workspace = await workspaces.create({ studentDisplayName: '测试', projectType })
      expect(workspace.templateId).toBe(directory)
      const reopened = new WorkspaceService(options)
      expect((await reopened.get(workspace.id)).templateId).toBe(directory)
      const resolver = new FirmwareBaselineResolver({ staticRoot: join(repo, 'resources'), isPackaged: false })
      resolver.register(manifest.id, baseline)
      const candidates = new CandidateService({ rootDir: root, workspaces: reopened, builder: { async build() { throw new Error('not used') } } })
      const explorer = new ProjectExplorerService(reopened, candidates, resolver)
      const snapshot = await explorer.getSnapshot(workspace.id)
      const paths = snapshot.nodes.filter(node => node.kind === 'file').map(node => node.displayPath)
      expect(paths).toContain(editionId === 'mcu-foundations' ? 'Startup/startup_ch32v20x_D6.S' : 'gcc/startup_mspm0g350x_gcc.c')
      expect(paths).not.toContain('gpio_toggle_output.syscfg')
      if (projectType === 'pony') {
        expect(paths).toContain('src/robotdog/robotdog_runtime.c')
        expect(paths).toContain('src/bsp/bsp_servo.c')
        expect(paths).toContain('generated/ti_msp_dl_config.h')
        expect(paths.length).toBeGreaterThan(50)
      } else expect(paths.some(path => path.includes('robotdog_runtime'))).toBe(false)
      const tools = editionId === 'mcu-foundations' ? new ToolchainService(repo) : new TiMspm0ToolchainService()
      const status = await tools.getStatus()
      if (!status.gcc.ok) return // Structure tests remain portable without local compilers.
      const build = tools instanceof TiMspm0ToolchainService ? new TiMspm0BuildService(tools, reopened, join(root, 'artifacts'), resolver) : new FirmwareBuildService(tools, { outputBase: join(root, 'artifacts'), baselineResolver: resolver, workspaces: reopened })
      await build.initialize()
      let result = await build.build({ workspaceId: workspace.id })
      expect(result.state, `${result.error}\n${result.logs.join('\n')}`).toBe('completed')
      if (editionId === 'ti-mspm0-foundations') expect(result.proof?.releaseEligible).toBe(true)
      if (projectType === 'pony') {
        const project = await reopened.getProjectRootForMain(workspace.id)
        const config = await readFile(join(project, 'board.syscfg'), 'utf8')
        await candidates.writeWorkspaceFile(workspace.id, 'board.syscfg', config.replace('basicControllerBusSpeed   = 400000', 'basicControllerBusSpeed   = 100000'))
        result = await build.build({ workspaceId: workspace.id })
        expect(result.state, result.error).toBe('completed')
        expect(await readFile(join(project, 'generated/ti_msp_dl_config.c'), 'utf8')).toContain('Set frequency to 100000 Hz')
      }
      const src = editionId === 'mcu-foundations' ? 'App/Src' : 'src'
      await candidates.createWorkspaceEntry(workspace.id, src, 'modules', true)
      await candidates.createWorkspaceEntry(workspace.id, `${src}/modules`, 'helper.h', false)
      await candidates.createWorkspaceEntry(workspace.id, `${src}/modules`, 'helper.c', false)
      await candidates.writeWorkspaceFile(workspace.id, `${src}/modules/helper.h`, '#pragma once\nint helper(void);\n')
      await candidates.writeWorkspaceFile(workspace.id, `${src}/modules/helper.c`, '#include "helper.h"\nint helper(void) { return 1; }\n')
      const entry = `${src}/main.c`
      const project = await reopened.getProjectRootForMain(workspace.id)
      const main = await readFile(join(project, entry), 'utf8')
      await candidates.writeWorkspaceFile(workspace.id, entry, `#include "modules/helper.h"\n${main.replace(/int main\(void\)\s*\{/, 'int main(void) { (void)helper();')}`)
      result = await build.build({ workspaceId: workspace.id })
      expect(result.state, `${result.error}\n${result.logs.join('\n')}`).toBe('completed')
      await candidates.writeWorkspaceFile(workspace.id, `${src}/modules/helper.c`, '#error NEW_MODULE_IS_COMPILED\n')
      expect((await build.build({ workspaceId: workspace.id })).state).toBe('failed')
      await candidates.writeWorkspaceFile(workspace.id, `${src}/modules/helper.c`, '#include "helper.h"\nint helper(void) { return 1; }\n')
      result = await build.build({ workspaceId: workspace.id })
      expect(result.state, `${result.error}\n${result.logs.join('\n')}`).toBe('completed')
    } finally { await rm(root, { recursive: true, force: true }) }
  }, 120_000)
})
