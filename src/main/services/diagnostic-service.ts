import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { AppRuntimeInfo, DiagnosticExportResult } from '../../shared/types'

export interface DiagnosticServiceOptions {
  dataRoot: string
  getRuntimeInfo(): Promise<Omit<AppRuntimeInfo, 'dataRoot' | 'diagnosticsRoot'>>
  now?: () => Date
}

export class DiagnosticService {
  readonly dataRoot: string
  readonly diagnosticsRoot: string
  private readonly now: () => Date

  constructor(private readonly options: DiagnosticServiceOptions) {
    this.dataRoot = resolve(options.dataRoot)
    this.diagnosticsRoot = join(this.dataRoot, 'diagnostics')
    this.now = options.now ?? (() => new Date())
  }

  async getRuntimeInfo(): Promise<AppRuntimeInfo> {
    return { dataRoot: this.dataRoot, diagnosticsRoot: this.diagnosticsRoot, ...await this.options.getRuntimeInfo() }
  }

  async export(): Promise<DiagnosticExportResult> {
    await mkdir(this.diagnosticsRoot, { recursive: true })
    const createdAt = this.now().toISOString()
    const safeTimestamp = createdAt.replace(/[:.]/g, '-')
    const finalPath = join(this.diagnosticsRoot, `robotdog-diagnostics-${safeTimestamp}.json`)
    const temporaryPath = `${finalPath}.tmp`
    const runtime = await this.getRuntimeInfo()
    const document = {
      schemaVersion: 1,
      createdAt,
      privacy: {
        included: ['应用模式与版本环境', '工具链状态', '固件基线校验', 'AI 运行时状态', '工作区数量', 'WCH-Link 驱动安装状态'],
        excluded: ['API Key', '学生代码', '聊天正文', '候选修改内容', '固件二进制']
      },
      runtime
    }
    const content = `${JSON.stringify(document, null, 2)}\n`
    try {
      await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx' })
      await rename(temporaryPath, finalPath)
    } catch (error) {
      await rm(temporaryPath, { force: true })
      throw error
    }
    return {
      path: finalPath,
      createdAt,
      bytes: Buffer.byteLength(content),
      included: document.privacy.included,
      excluded: document.privacy.excluded
    }
  }
}
