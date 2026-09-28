import type { JSX } from 'react'
import { FileDown, FolderOpen } from 'lucide-react'
import type { AppEditionProfile } from '../../../../shared/edition'
import type { AppRuntimeInfo, DiagnosticExportResult, FirmwareBaselineStatus, ToolchainStatus } from '../../../../shared/types'
import type { StudentProblem } from '../../lib/student-errors'
import { ProblemCard } from '../ProblemCard'

export interface AdvancedSettingsProps {
  runtime?: AppRuntimeInfo
  toolchain?: ToolchainStatus
  baseline?: FirmwareBaselineStatus
  editionProfile?: AppEditionProfile
  diagnostic?: DiagnosticExportResult
  error?: StudentProblem
  busy: boolean
  onExportDiagnostics(): void
  onOpenDataDirectory(): void
}

export function AdvancedSettings({
  runtime,
  toolchain,
  baseline,
  editionProfile,
  diagnostic,
  error,
  busy,
  onExportDiagnostics,
  onOpenDataDirectory
}: AdvancedSettingsProps): JSX.Element {
  const toolchainReady = Boolean(toolchain?.gcc.ok && toolchain?.objcopy.ok && toolchain?.size.ok)
  const baselineReady = Boolean(baseline?.readyForTesting)

  const toolchainLabel = editionProfile?.id === 'ti-mspm0-foundations'
    ? 'TI Arm Clang Toolchain'
    : 'CH32 GCC Toolchain'

  const rawBaselineLabel = baseline?.label ?? ''
  const cleanBaselineLabel = rawBaselineLabel
    ? rawBaselineLabel.replace(/provisional/gi, '').replace(/临时/g, '').trim()
    : editionProfile?.id === 'ti-mspm0-foundations'
      ? 'MSPM0 教学固件'
      : 'CH32V203 RHS 教学固件'

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">高级</h3>
      </div>

      <section className="settings-section" aria-labelledby="diagnostics-heading">
        <h4 id="diagnostics-heading" className="settings-section-title">诊断与数据</h4>
        <p className="settings-section-desc">排查问题时导出系统状态，不会收集 API Key、学生代码或聊天正文。</p>

        <div className="settings-rows">
          <div className="settings-row">
            <span className="settings-row-label">AI 助教状态</span>
            <div className="settings-row-value">
              <span className={`status-dot ${runtime?.agent.ready ? 'dot-ready' : 'dot-waiting'}`} aria-hidden="true" />
              <span>{runtime?.agent.ready ? '正常' : (runtime?.agent.detail ?? '正在检查…')}</span>
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">本机工作区</span>
            <span className="settings-row-value">{runtime ? `${runtime.workspaceCount} 个` : '正在读取…'}</span>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">数据位置</span>
            <span className="settings-row-value settings-path-value">
              <span className="settings-path-text" title={runtime?.dataRoot}>
                {runtime?.dataRoot ?? '正在读取…'}
              </span>
            </span>
          </div>
        </div>

        <div className="settings-action-row" style={{ marginTop: '14px' }}>
          <button
            type="button"
            className="settings-btn-secondary"
            onClick={onExportDiagnostics}
            disabled={busy}
          >
            <FileDown size={14} />
            <span>{busy ? '正在导出…' : '导出诊断文件'}</span>
          </button>
          <button
            type="button"
            className="settings-btn-secondary"
            onClick={onOpenDataDirectory}
          >
            <FolderOpen size={14} />
            <span>打开数据文件夹</span>
          </button>
        </div>

        {diagnostic && (
          <p className="diagnostic-success">已导出：{diagnostic.path}（{diagnostic.bytes} 字节）</p>
        )}
        {error && <ProblemCard problem={error} tone="danger" compact />}
      </section>

      <div className="settings-divider" />

      <section className="settings-section" aria-labelledby="dev-env-heading">
        <h4 id="dev-env-heading" className="settings-section-title">开发环境</h4>
        <p className="settings-section-desc">查看底层编译器与硬件固件基线状态。</p>

        <div className="settings-rows">
          <div className="settings-row">
            <span className="settings-row-label">程序翻译工具</span>
            <div className="settings-row-value">
              <span className={`status-dot ${toolchainReady ? 'dot-ready' : 'dot-waiting'}`} aria-hidden="true" />
              <span>{toolchainReady ? '已就绪' : '检查中'}</span>
              <span className="settings-subtext">· {toolchainLabel}</span>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-row-label">固件基线</span>
            <div className="settings-row-value">
              <span className={`status-dot ${baselineReady ? 'dot-ready' : 'dot-waiting'}`} aria-hidden="true" />
              <span>{baselineReady ? '可用' : '未就绪'}</span>
              <span className="settings-subtext">· {cleanBaselineLabel}</span>
            </div>
          </div>

          {toolchain?.sysconfig && (
            <div className="settings-row">
              <span className="settings-row-label">SysConfig</span>
              <div className="settings-row-value">
                <span className={`status-dot ${toolchain.sysconfig.ok ? 'dot-ready' : 'dot-waiting'}`} aria-hidden="true" />
                <span>{toolchain.sysconfig.ok ? '已检测' : '未就绪'}</span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
