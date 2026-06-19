import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import type { ToolStatus, ToolchainStatus } from '../../shared/types'

const BUNDLED_WCH_RELATIVE = ['vendor', 'wch']
const PACKAGED_WCH_RELATIVE = ['toolchains', 'wch']

function execVersion(executable: string, args: string[] = ['--version']): Promise<string> {
  return new Promise((resolveVersion, reject) => {
    execFile(executable, args, { windowsHide: true, timeout: 7000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      resolveVersion(`${stdout}${stderr}`.trim())
    })
  })
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? text.trim()
}

function makeMissing(label: string, path: string): ToolStatus {
  return {
    ok: false,
    label,
    path,
    detail: '未找到内置工具'
  }
}

export class ToolchainService {
  private readonly repoRoot: string

  constructor(repoRoot = process.cwd()) {
    this.repoRoot = repoRoot
  }

  getBundledRoot(): string {
    const packagedRoot = join(process.resourcesPath ?? '', ...PACKAGED_WCH_RELATIVE)
    if (process.resourcesPath && existsSync(packagedRoot)) return packagedRoot
    return resolve(this.repoRoot, ...BUNDLED_WCH_RELATIVE)
  }

  getGccPath(): string {
    return join(this.getBundledRoot(), 'Toolchain', 'RISC-V Embedded GCC12', 'bin', 'riscv-wch-elf-gcc.exe')
  }

  getObjcopyPath(): string {
    return join(this.getBundledRoot(), 'Toolchain', 'RISC-V Embedded GCC12', 'bin', 'riscv-wch-elf-objcopy.exe')
  }

  getSizePath(): string {
    return join(this.getBundledRoot(), 'Toolchain', 'RISC-V Embedded GCC12', 'bin', 'riscv-wch-elf-size.exe')
  }

  getOpenocdPath(): string {
    return join(this.getBundledRoot(), 'OpenOCD', 'OpenOCD', 'bin', 'openocd.exe')
  }

  async getStatus(): Promise<ToolchainStatus> {
    const root = this.getBundledRoot()
    const [gcc, objcopy, size, openocd] = await Promise.all([
      this.probeTool('WCH GCC12', this.getGccPath()),
      this.probeTool('WCH objcopy', this.getObjcopyPath()),
      this.probeTool('WCH size', this.getSizePath()),
      this.probeTool('WCH OpenOCD', this.getOpenocdPath())
    ])

    return {
      bundled: root.includes(`${BUNDLED_WCH_RELATIVE[0]}\\${BUNDLED_WCH_RELATIVE[1]}`) || root.includes(`${BUNDLED_WCH_RELATIVE[0]}/${BUNDLED_WCH_RELATIVE[1]}`),
      root,
      gcc,
      objcopy,
      size,
      openocd
    }
  }

  private async probeTool(label: string, path: string): Promise<ToolStatus> {
    if (!existsSync(path)) return makeMissing(label, path)

    try {
      const version = firstLine(await execVersion(path))
      return {
        ok: true,
        label,
        path,
        version,
        detail: version
      }
    } catch (caught) {
      return {
        ok: false,
        label,
        path,
        detail: caught instanceof Error ? caught.message : String(caught)
      }
    }
  }
}
