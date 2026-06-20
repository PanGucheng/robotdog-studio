import { Activity, Code2, Cpu, FileArchive, Gauge, Play, ScrollText, Settings2, ShieldCheck, Square, TerminalSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CandidateDiff, CandidateSnapshot, CcdFrame, DeviceConnectionSnapshot, FirmwareBuildSnapshot, FirmwareUpdateSnapshot, LogEntry, RecoverySnapshot, RobotStatus, ToolchainStatus, WorkspaceHistoryEntry } from '../../../shared/types'
import { CcdPlot } from './CcdPlot'
import { ConnectionBay } from './ConnectionBay'
import { RecoveryPanel } from './RecoveryPanel'
import { DiffReview } from './DiffReview'
import { DisplaySettings } from './DisplaySettings'
import { StudentCodeEditor } from './StudentCodeEditor'
import type { UiScale } from '../lib/ui-scale'
import type { WorkspaceSummary } from '../../../shared/types'

interface WorkbenchProps {
  frame: CcdFrame
  status: RobotStatus
  logs: LogEntry[]
  toolchain?: ToolchainStatus
  build: FirmwareBuildSnapshot
  connection: DeviceConnectionSnapshot
  update: FirmwareUpdateSnapshot
  recovery: RecoverySnapshot
  teacherMode: boolean
  busy: boolean
  candidate?: CandidateSnapshot
  workspace?: WorkspaceSummary
  candidateDiff?: CandidateDiff
  candidateDiffLoading: boolean
  candidateDiffError?: string
  workspaceHistory: WorkspaceHistoryEntry[]
  uiScale: UiScale
  onUiScaleChange(scale: UiScale): void
  onRejectCandidate(candidateId: string): void
  onBuildCandidate(candidateId: string): void
  onApplyCandidate(candidateId: string): void
  onUndoWorkspace(): void
  onCandidateChanged(candidate?: CandidateSnapshot): void
  onExplainDiagnostic(candidateId: string, diagnostic: string): void
  onBuildFirmware: () => void
  onCancelBuild: () => void
  onToggleUsb: () => void
  onStartUpdate: () => void
  onCancelUpdate: () => void
  onStartRecovery: () => void
  onCancelRecovery: () => void
}

const tabs = [
  ['巡线参数', Gauge],
  ['CCD 曲线', Activity],
  ['串口日志', TerminalSquare],
  ['编译 / 烧录', Cpu],
  ['编写代码', Code2],
  ['修改确认', ShieldCheck],
  ['设置', Settings2]
] as const

export function Workbench({ frame, status, logs, toolchain, build, connection, update, recovery, teacherMode, busy, candidate, workspace, candidateDiff, candidateDiffLoading, candidateDiffError, workspaceHistory, uiScale, onUiScaleChange, onRejectCandidate, onBuildCandidate, onApplyCandidate, onUndoWorkspace, onCandidateChanged, onExplainDiagnostic, onBuildFirmware, onCancelBuild, onToggleUsb, onStartUpdate, onCancelUpdate, onStartRecovery, onCancelRecovery }: WorkbenchProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number][0]>('CCD 曲线')
  useEffect(() => { if (candidate?.state === 'review_ready' || candidate?.state === 'build_passed') setActiveTab('修改确认') }, [candidate?.id, candidate?.state])
  const error = frame.center - frame.target
  const buildProgress = build.totalFiles > 0 ? Math.round((build.completedFiles / build.totalFiles) * 100) : 0
  const toolchainReady = Boolean(toolchain?.gcc.ok && toolchain?.objcopy.ok && toolchain?.size.ok)
  const artifactCurrent = build.state === 'completed' && Boolean(workspace && build.proof && build.proof.workspaceId === workspace.id && build.proof.workspaceCommit === workspace.headCommit && build.proof.firmwareBaselineId === workspace.firmwareBaselineId)
  const effectiveBuildState = build.state === 'completed' && !artifactCurrent ? 'idle' : build.state
  return (
    <section className="workbench">
      <nav className="workbench-tabs" aria-label="工作台标签">
        {tabs.map(([label, Icon]) => (
          <button type="button" className={label === activeTab ? 'active' : ''} key={label} onClick={() => setActiveTab(label)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      {activeTab === '编写代码' ? <StudentCodeEditor workspace={workspace} candidate={candidate} busy={busy} onCandidateChanged={onCandidateChanged} onReadyForReview={() => setActiveTab('修改确认')} onExplainDiagnostic={onExplainDiagnostic} /> : activeTab === '修改确认' ? <DiffReview candidate={candidate} diff={candidateDiff} loading={candidateDiffLoading} error={candidateDiffError} history={workspaceHistory} busy={busy} onReject={onRejectCandidate} onBuild={onBuildCandidate} onApply={onApplyCandidate} onUndo={onUndoWorkspace} /> : activeTab === '设置' ? (
        <DisplaySettings scale={uiScale} toolchain={toolchain} onScaleChange={onUiScaleChange} />
      ) : activeTab === '编译 / 烧录' ? (
        <div className="workbench-content firmware-workbench">
          <div className="ccd-summary">
            <div>
              <span className="eyebrow">编译与安全下载</span>
              <h2>{update.state === 'completed' ? '新固件已在小马上运行' : build.state === 'running' ? `正在编译：${build.currentFile ?? '准备中'}` : artifactCurrent ? '固件产物已准备好' : build.state === 'completed' ? '代码已变化，需要重新生成固件' : '无线调试，有线下载'}</h2>
              <p>蓝牙负责地面调试，板载 USB 负责稳定下载；WCH-Link 只在教师恢复时使用。</p>
            </div>
            <div className={`recognition-badge ${toolchainReady ? 'is-ready' : ''}`}>
              <span className={toolchainReady ? 'valid-dot' : 'invalid-dot'} />
              {toolchainReady ? '工具链就绪' : '检查工具链'}
            </div>
          </div>

          <ConnectionBay
            connection={connection}
            update={update}
            buildState={effectiveBuildState}
            busy={busy}
            onToggleUsb={onToggleUsb}
            onStartUpdate={onStartUpdate}
            onCancelUpdate={onCancelUpdate}
          />

          {teacherMode && <RecoveryPanel recovery={recovery} busy={busy} onStart={onStartRecovery} onCancel={onCancelRecovery} />}

          <div className="firmware-grid">
            <article className="firmware-card">
              <span className="eyebrow">Bundled toolchain</span>
              <h3>WCH GCC12 / OpenOCD</h3>
              <div className="toolchain-list">
                <span><strong>GCC</strong>{toolchain?.gcc.detail ?? '读取中'}</span>
                <span><strong>OBJCPY</strong>{toolchain?.objcopy.ok ? '已发现' : toolchain?.objcopy.detail ?? '读取中'}</span>
                <span><strong>OPENOCD</strong>{toolchain?.openocd.detail ?? '读取中'}</span>
              </div>
            </article>

            <article className="firmware-card build-status-card">
              <span className="eyebrow">Build station</span>
              <h3>{build.state === 'idle' ? '等待编译' : build.state === 'failed' ? '编译失败' : artifactCurrent ? '编译完成' : build.state === 'completed' ? '产物已过期' : build.state === 'cancelled' ? '已取消' : '正在编译'}</h3>
              <div className="build-progress">
                <span style={{ width: `${buildProgress}%` }} />
              </div>
              <p>{build.completedFiles}/{build.totalFiles || 29} 个源文件 · {build.outputDir ?? '尚未创建输出目录'}</p>
              <div className="firmware-actions">
                <button type="button" className="button-primary" onClick={onBuildFirmware} disabled={busy || build.state === 'running' || !toolchainReady}>
                  <Play size={15} /> 编译固件
                </button>
                <button type="button" onClick={onCancelBuild} disabled={build.state !== 'running'}>
                  <Square size={14} /> 取消
                </button>
              </div>
            </article>
          </div>

          <div className="artifact-row">
            {build.artifacts.length === 0 ? (
              <article className="empty-artifacts"><FileArchive size={18} /> 编译完成后，这里会出现 ELF / HEX / BIN / MAP。</article>
            ) : build.artifacts.map((artifact) => (
              <article key={artifact.path}>
                <span>{artifact.kind.toUpperCase()}</span>
                <strong>{artifact.name}</strong>
                <small>{artifact.bytes ? `${Math.round(artifact.bytes / 1024)} KB` : '已生成'}{artifact.sha256 ? ` · ${artifact.sha256.slice(0, 8)}` : ''}</small>
              </article>
            ))}
          </div>

          {build.size && (
            <div className="metric-row firmware-size-row">
              <article><span>text</span><strong>{build.size.text}</strong><small>程序代码</small></article>
              <article><span>data</span><strong>{build.size.data}</strong><small>已初始化数据</small></article>
              <article><span>bss</span><strong>{build.size.bss}</strong><small>未初始化数据</small></article>
              <article><span>total</span><strong>{build.size.dec}</strong><small>十进制体积</small></article>
            </div>
          )}

          {build.proof && <div className={`build-proof-strip ${artifactCurrent ? '' : 'is-stale'}`}>
            <ShieldCheck size={16} />
            <span><strong>{artifactCurrent ? '产物身份已核对' : '产物已过期'}</strong>{build.proof.releaseEligible ? '正式固件基线' : '临时测试基线 · 不可发布'} · 存档 {build.proof.workspaceCommit.slice(0, 7)} · 输入 {build.proof.inputHash.slice(0, 8)}</span>
          </div>}

          <div className="firmware-log">
            <div className="log-strip-title"><TerminalSquare size={15} /> 编译日志</div>
            <div className="firmware-log-lines">
              {build.logs.length === 0 ? <span className="empty-log">点击“编译固件”后，GCC 输出会在这里滚动。</span> : build.logs.slice(-14).map((line, index) => (
                <span key={`${line}-${index}`} className={/error|错误|failed/i.test(line) ? 'error' : /warning|警告/i.test(line) ? 'warning' : ''}>{line}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
      <div className="workbench-content">
        <div className="ccd-summary">
          <div>
            <span className="eyebrow">实时传感器</span>
            <h2>{frame.valid ? `黑线在目标点${error >= 0 ? '右侧' : '左侧'} ${Math.abs(error)} 格` : '等待第一次黑线检测'}</h2>
            <p>{status.connection === 'ready' ? '模拟 CCD 数据已就绪，点击“检测黑线”可刷新。' : '连接机器马后开始读取 CCD。'}</p>
          </div>
          <div className="recognition-badge">
            <span className={frame.valid ? 'valid-dot' : 'invalid-dot'} />
            {frame.valid ? '识别有效' : '等待数据'}
          </div>
        </div>

        <CcdPlot frame={frame} />

        <div className="metric-row">
          <article><span>黑线中心</span><strong>{frame.center}</strong><small>像素位置</small></article>
          <article><span>目标中心</span><strong>{frame.target}</strong><small>理想位置</small></article>
          <article><span>当前偏差</span><strong className={frame.valid && error === 0 ? 'safe-value' : 'accent-value'}>{frame.valid ? `${error > 0 ? '+' : ''}${error}` : '—'}</strong><small>{frame.valid ? (error > 0 ? '需要轻微右转' : error < 0 ? '需要轻微左转' : '保持方向') : '等待数据'}</small></article>
          <article><span>动作状态</span><strong className="action-value">{status.action === 'idle' ? '待命' : status.action}</strong><small>3 秒安全时限</small></article>
        </div>

        <div className="log-strip">
          <div className="log-strip-title"><ScrollText size={15} /> 最近活动</div>
          <div className="log-lines">
            {logs.length === 0 ? <span className="empty-log">连接模拟小马后，这里会显示操作记录。</span> : logs.slice(-3).map((entry) => (
              <span key={entry.id} className={`log-line ${entry.level}`}>
                <time>{new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}</time>
                {entry.message}
              </span>
            ))}
          </div>
        </div>
      </div>
      )}
    </section>
  )
}
