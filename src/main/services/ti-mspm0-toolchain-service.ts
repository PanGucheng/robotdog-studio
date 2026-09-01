import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ToolStatus, ToolchainStatus } from '../../shared/types'

export const TI_MSPM0_VERSIONS = Object.freeze({
  sdk: '2.11.00.07',
  sysconfig: '1.28.1',
  gcc: '9-2019-q4-major'
})

export class TiMspm0ToolchainService {
  readonly sdkRoot = resolve(process.env.ROBOTDOG_TI_MSPM0_SDK_ROOT ?? 'D:\\ti\\mspm0_sdk_2_11_00_07')
  readonly sysconfigRoot = resolve(process.env.ROBOTDOG_TI_SYSCONFIG_ROOT ?? 'D:\\ti\\sysconfig_1.28.1')
  readonly gccRoot = resolve(process.env.ROBOTDOG_TI_GCC_ROOT ?? 'D:\\ti\\gcc-arm-none-eabi-9-2019-q4-major-win32')
  readonly openocdRoot = resolve(process.env.ROBOTDOG_TI_OPENOCD_ROOT ?? 'D:\\ti\\openocd-d9b957f-i686-w64-mingw32')

  getGccPath(): string { return join(this.gccRoot, 'bin', 'arm-none-eabi-gcc.exe') }
  getObjcopyPath(): string { return join(this.gccRoot, 'bin', 'arm-none-eabi-objcopy.exe') }
  getSizePath(): string { return join(this.gccRoot, 'bin', 'arm-none-eabi-size.exe') }
  getSysconfigCliPath(): string { return join(this.sysconfigRoot, 'sysconfig_cli.bat') }
  getSysconfigGuiPath(): string { return join(this.sysconfigRoot, 'sysconfig_gui.bat') }
  getProductPath(): string { return join(this.sdkRoot, '.metadata', 'product.json') }
  getOpenocdPath(): string { return join(this.openocdRoot, 'bin', 'openocd.exe') }
  getOpenocdScriptsPath(): string { return join(this.openocdRoot, 'share', 'openocd', 'scripts') }
  getOpenocdBoardConfig(): string { return join(this.getOpenocdScriptsPath(), 'board', 'ti', 'mspm0-launchpad.cfg') }

  async getStatus(): Promise<ToolchainStatus> {
    const [gcc, objcopy, size, openocd, sysconfig] = await Promise.all([
      probe('Arm GCC', this.getGccPath()),
      probe('Arm objcopy', this.getObjcopyPath()),
      probe('Arm size', this.getSizePath()),
      probe('MSPM0 OpenOCD', this.getOpenocdPath(), ['--version']),
      probe('TI SysConfig 1.28.1', this.getSysconfigCliPath(), ['--version'], true)
    ])
    const sdkOk = existsSync(this.getProductPath())
    const sdk: ToolStatus = { ok: sdkOk, label: 'MSPM0 SDK 2.11.00.07', path: this.sdkRoot, version: sdkOk ? TI_MSPM0_VERSIONS.sdk : undefined, detail: sdkOk ? `MSPM0 SDK ${TI_MSPM0_VERSIONS.sdk}` : '没有找到固定版本 MSPM0 SDK' }
    return { bundled: false, root: resolve(this.sdkRoot, '..'), gcc, objcopy, size, openocd, sysconfig, sdk }
  }
}

async function probe(label: string, path: string, args = ['--version'], batch = false): Promise<ToolStatus> {
  if (!existsSync(path)) return { ok: false, label, path, detail: '没有找到固定版本工具' }
  try {
    const output = await run(batch ? process.env.ComSpec ?? 'cmd.exe' : path, batch ? ['/d', '/c', 'call', path, ...args] : args)
    const version = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? label
    return { ok: true, label, path, version, detail: version }
  } catch (caught) {
    return { ok: false, label, path, detail: caught instanceof Error ? caught.message : String(caught) }
  }
}

function run(executable: string, args: string[]): Promise<string> {
  return new Promise((resolveOutput, reject) => execFile(executable, args, { windowsHide: true, timeout: 10_000 }, (error, stdout, stderr) => {
    if (error) reject(error)
    else resolveOutput(`${stdout}${stderr}`.trim())
  }))
}
