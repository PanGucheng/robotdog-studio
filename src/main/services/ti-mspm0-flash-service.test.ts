import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { beforeEach, expect, it, vi } from 'vitest'
import { TiMspm0FlashService } from './ti-mspm0-flash-service'
import type { TiMspm0ToolchainService } from './ti-mspm0-toolchain-service'
import type { TiMspm0BuildService } from './ti-mspm0-build-service'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

const probeOutput = 'Info : Using CMSIS-DAPv2 interface\nInfo : [mspm0x.cpu] Cortex-M0+ r0p1 processor detected\nInfo : Examination succeed\n'

beforeEach(() => { vi.clearAllMocks() })

function createService(programOutput: string, programCode: number) {
  let call = 0
  vi.mocked(spawn).mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() })
    const isProbe = call++ === 0
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(isProbe ? probeOutput : programOutput))
      child.emit('close', isProbe ? 0 : programCode)
    })
    return child as unknown as ReturnType<typeof spawn>
  })
  const tools = { getOpenocdScriptsPath: () => 'D:/TI tools/scripts', getOpenocdPath: () => 'D:/TI tools/openocd.exe' } as TiMspm0ToolchainService
  const build = {
    requireCurrentArtifact: vi.fn().mockResolvedValue({ name: 'gpio.out', kind: 'elf', bytes: 672, sha256: 'example', path: 'D:\\Student project\\gpio.out' }),
    getSnapshot: () => ({ proof: { workspaceCommit: 'workspace', firmwareBaselineId: 'ti-mspm0g3507-sdk-2.11.00.07' } })
  } as unknown as TiMspm0BuildService
  return new TiMspm0FlashService(tools, build)
}

it('configures G3507 SRAM before loading the target and retains program verify before reset', async () => {
  const result = await createService('** Programming Finished **\n** Verified OK **\n', 0).flashCurrent('workspace')
  expect(result.state).toBe('completed')
  expect(spawn).toHaveBeenCalledTimes(2)
  for (const [, args] of vi.mocked(spawn).mock.calls) {
    expect(args!.indexOf('set WORKAREABASE 0x20200000')).toBeGreaterThan(-1)
    expect(args!.indexOf('set WORKAREABASE 0x20200000')).toBeLessThan(args!.indexOf('target/ti/mspm0.cfg'))
    expect(args).toContain('shutdown')
    expect(args).not.toContain('exit')
  }
  const commands = vi.mocked(spawn).mock.calls[1][1]!
  const program = 'program {D:/Student project/gpio.out} verify'
  expect(commands).toContain(program)
  expect(commands.indexOf(program)).toBeLessThan(commands.indexOf('reset run'))
})

it('reports a target CRC algorithm timeout without claiming a confirmed flash mismatch or success', async () => {
  const result = await createService('** Programming Finished **\nError: timed out while waiting for target halted\nError: [mspm0x.cpu] error executing cortex_m crc algorithm\nError: checksum mismatch - attempting binary compare\n** Verify Failed **\n', 1).flashCurrent('workspace')
  expect(result.state).toBe('failed')
  expect(result.message).toContain('CRC 校验程序运行失败')
  expect(result.message).toContain('尚不能认定 Flash 数据写错')
  expect(result.logs.join('\n')).toContain('error executing cortex_m crc algorithm')
})

it('keeps genuine verification failures as failed operations', async () => {
  const result = await createService('Error: checksum mismatch - attempting binary compare\ndiff 0 address 0x00000000. Was 0xff instead of 0x00\n** Verify Failed **\n', 1).flashCurrent('workspace')
  expect(result.state).toBe('failed')
  expect(result.message).toContain('校验失败')
  expect(result.message).not.toContain('CRC 校验程序运行失败')
})
