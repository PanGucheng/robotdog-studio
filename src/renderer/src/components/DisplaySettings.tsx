import { Check, Eye, FileDown, FlaskConical, FolderOpen, MonitorUp, Route, Type } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AppRuntimeInfo, DiagnosticExportResult, FirmwareBaselineStatus, ToolchainStatus } from '../../../shared/types'
import { UI_SCALE_OPTIONS, type UiScale } from '../lib/ui-scale'
import { getRobotApi } from '../lib/browser-demo-api'
import { toStudentErrorMessage } from '../lib/student-errors'

interface DisplaySettingsProps {
  scale: UiScale
  toolchain?: ToolchainStatus
  baseline?: FirmwareBaselineStatus
  onScaleChange(scale: UiScale): void
}

const scaleCopy: Record<UiScale, string> = {
  100: '适合 1080p 或已开启系统缩放',
  125: '推荐 27 英寸 2K 屏幕',
  150: '适合 4K 屏幕或偏大文字',
  175: '最大文字与操作按钮'
}

export function DisplaySettings({ scale, toolchain, baseline, onScaleChange }: DisplaySettingsProps): React.JSX.Element {
  const toolchainReady = Boolean(toolchain?.gcc.ok && toolchain?.objcopy.ok && toolchain?.size.ok)
  const [runtime, setRuntime] = useState<AppRuntimeInfo>()
  const [diagnostic, setDiagnostic] = useState<DiagnosticExportResult>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  useEffect(() => { void getRobotApi().getRuntimeInfo().then(setRuntime).catch((caught) => setError(toStudentErrorMessage(caught))) }, [])
  const exportDiagnostics = (): void => {
    setBusy(true); setError(undefined)
    void getRobotApi().exportDiagnostics().then(setDiagnostic).catch((caught) => setError(toStudentErrorMessage(caught))).finally(() => setBusy(false))
  }
  return (
    <div className="display-settings">
      <header className="settings-hero">
        <span className="settings-hero-icon"><MonitorUp size={23} /></span>
        <div>
          <span className="eyebrow">显示与学习体验</span>
          <h2>让文字和按钮看起来舒服</h2>
          <p>界面大小只影响显示，不会改变代码、参数或机器马动作。</p>
        </div>
      </header>

      <section className="scale-setting" aria-labelledby="scale-heading">
        <div className="setting-copy">
          <Type size={18} />
          <span><strong id="scale-heading">界面大小</strong><small>当前为 {scale}%，选择后立即生效并在下次启动时保留。</small></span>
        </div>
        <div className="scale-options" role="group" aria-label="选择界面大小">
          {UI_SCALE_OPTIONS.map((option) => (
            <button type="button" key={option} className={option === scale ? 'active' : ''} aria-pressed={option === scale} onClick={() => onScaleChange(option)}>
              <span className="scale-sample" style={{ fontSize: `${12 + (option - 100) / 25}px` }}>Aa</span>
              <strong>{option}%</strong>
              <small>{scaleCopy[option]}</small>
              {option === scale && <i><Check size={12} /> 已选择</i>}
            </button>
          ))}
        </div>
      </section>

      <div className="settings-status-grid">
        <article>
          <span className="settings-status-icon"><Route size={18} /></span>
          <div><strong>学习步骤</strong><p>提出想法 → 看懂修改 → 生成程序 → 连接小马</p></div>
        </article>
        <article>
          <span className="settings-status-icon"><Eye size={18} /></span>
          <div><strong>文字优先</strong><p>主要说明使用较大字号，技术细节仍可按需查看。</p></div>
        </article>
        <article className={toolchainReady ? 'ready' : ''}>
          <span className="settings-status-icon"><Check size={18} /></span>
          <div><strong>程序翻译工具</strong><p>{toolchainReady ? '内置工具已经准备好。' : '工具仍在检查；这不会影响查看项目。'}</p></div>
        </article>
        <article className={baseline?.releaseEligible ? 'ready' : 'provisional'}>
          <span className="settings-status-icon"><FlaskConical size={18} /></span>
          <div><strong>{baseline?.releaseEligible ? '正式 SDK' : '临时 SDK 基线'}</strong><p>{baseline?.readyForTesting ? `${baseline.label}：仅用于功能测试。` : 'SDK 校验未通过，完整固件编译已停用。'}</p></div>
        </article>
      </div>

      <section className="diagnostic-setting" aria-labelledby="diagnostic-heading">
        <div className="setting-copy"><FileDown size={18} /><span><strong id="diagnostic-heading">教师诊断与本机数据</strong><small>排查问题时导出状态，不会收集 API Key、学生代码或聊天正文。</small></span></div>
        <dl>
          <div><dt>AI 助教</dt><dd className={runtime?.agent.ready ? 'ready' : ''}>{runtime?.agent.detail ?? '正在检查…'}</dd></div>
          <div><dt>练习数量</dt><dd>{runtime ? `${runtime.workspaceCount} 个本机工作区` : '正在读取…'}</dd></div>
          <div><dt>数据位置</dt><dd title={runtime?.dataRoot}>{runtime?.dataRoot ?? '正在读取…'}</dd></div>
        </dl>
        <div className="diagnostic-actions">
          <button type="button" onClick={exportDiagnostics} disabled={busy}><FileDown size={14} /> {busy ? '正在导出…' : '导出诊断文件'}</button>
          <button type="button" onClick={() => { void getRobotApi().openDataDirectory().catch((caught) => setError(toStudentErrorMessage(caught))) }}><FolderOpen size={14} /> 打开数据文件夹</button>
        </div>
        {diagnostic && <p className="diagnostic-success">已导出：{diagnostic.path}（{diagnostic.bytes} 字节）</p>}
        {error && <p className="diagnostic-error">{error}</p>}
      </section>
    </div>
  )
}
