import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { EDITION_PROFILES } from '../src/shared/edition'
import { TiMspm0BuildService } from '../src/main/services/ti-mspm0-build-service'
import { TiMspm0FlashService } from '../src/main/services/ti-mspm0-flash-service'
import { TiMspm0ToolchainService } from '../src/main/services/ti-mspm0-toolchain-service'
import { WorkspaceService } from '../src/main/services/workspace-service'

const root = await mkdtemp(join(tmpdir(), 'robotdog-ti-mspm0-smoke-'))
try {
  const toolchain = new TiMspm0ToolchainService()
  const status = await toolchain.getStatus()
  for (const tool of [status.sdk, status.sysconfig, status.gcc, status.objcopy, status.size, status.openocd]) {
    if (!tool?.ok) throw new Error(`${tool?.label ?? '工具'} 不可用：${tool?.detail ?? 'unknown'}`)
  }
  const workspaces = new WorkspaceService({
    rootDir: root,
    templateRoot: resolve('resources/workspace-templates/ti-mspm0g3507-foundations'),
    templateVersion: 'sdk-2.11.00.07',
    firmwareBaselineId: 'ti-mspm0g3507-sdk-2.11.00.07',
    baselineCommit: '2110000700000000000000000000000000000000',
    edition: EDITION_PROFILES['ti-mspm0-foundations']
  })
  await workspaces.initialize()
  const workspace = await workspaces.create({ name: 'TI MSPM0 GPIO Golden Project', studentDisplayName: 'Smoke Test' })
  const build = new TiMspm0BuildService(toolchain, workspaces, join(root, 'artifacts'))
  await build.initialize()
  const result = await build.build({ workspaceId: workspace.id })
  if (result.state !== 'completed') throw new Error(result.error ?? 'TI MSPM0 build failed')
  console.log(`TI MSPM0 golden build passed: ${result.artifacts.find((item) => item.kind === 'elf')?.path}`)
  console.log(`Flash ${result.size!.text + result.size!.data} bytes; RAM ${result.size!.data + result.size!.bss} bytes`)
  if (process.argv.includes('--flash')) {
    const flash = await new TiMspm0FlashService(toolchain, build).flashCurrent(workspace.id)
    if (flash.state !== 'completed') throw new Error(flash.error ?? 'TI MSPM0 flash failed')
    console.log('TI MSPM0 CMSIS-DAP flash, verify and reset passed')
  }
} finally {
  if (!process.argv.includes('--keep')) await rm(root, { recursive: true, force: true })
  else console.log(`Kept smoke workspace: ${root}`)
}
