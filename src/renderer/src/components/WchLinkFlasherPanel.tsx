import { Cable, CheckCircle2, Cpu, FileWarning, LoaderCircle, ShieldAlert, Square, TerminalSquare, Zap } from 'lucide-react'
import type { FirmwareBuildSnapshot, WchLinkFlashSnapshot, WorkspaceSummary } from '../../../shared/types'

interface WchLinkFlasherPanelProps {
  snapshot: WchLinkFlashSnapshot
  build: FirmwareBuildSnapshot
  workspace?: WorkspaceSummary
  busy: boolean
  onProbe(): void
  onFlash(): void
  onCancel(): void
  onGoBuild(): void
}

const activeStates = new Set<WchLinkFlashSnapshot['state']>(['probing', 'flashing', 'verifying', 'resetting'])

export function WchLinkFlasherPanel({ snapshot, build, workspace, busy, onProbe, onFlash, onCancel, onGoBuild }: WchLinkFlasherPanelProps): React.JSX.Element {
  const active = activeStates.has(snapshot.state)
  const hex = build.artifacts.find((artifact) => artifact.kind === 'hex')
  const artifactCurrent = build.state === 'completed' && Boolean(workspace && build.proof && build.proof.workspaceId === workspace.id && build.proof.workspaceCommit === workspace.headCommit && build.proof.firmwareBaselineId === workspace.firmwareBaselineId)
  const targetAvailable = snapshot.state === 'target_ready' || snapshot.state === 'completed'
  const canFlash = targetAvailable && artifactCurrent && Boolean(hex)
  const confirmFlash = (): void => {
    if (!hex) return
    const accepted = window.confirm([
      `即将用 WCH-Link 写入当前程序：${hex.name}`,
      hex.bytes ? `大小：${Math.round(hex.bytes / 1024)} KB` : undefined,
      hex.sha256 ? `校验：${hex.sha256.slice(0, 12)}…` : undefined,
      workspace ? `学生对话：${workspace.name}` : undefined,
      build.proof ? `对应存档：${build.proof.workspaceCommit.slice(0, 7)}` : undefined,
      '',
      '这个操作会覆盖芯片中现有程序。烧录过程中请不要断电、拔线或移动 WCH-Link。'
    ].filter(Boolean).join('\n'))
    if (accepted) onFlash()
  }
  const steps = [
    { label: '连接烧录器', done: Boolean(snapshot.probe?.adapterName), active: snapshot.state === 'probing' },
    { label: '识别芯片', done: Boolean(snapshot.probe?.targetExamined), active: targetAvailable },
    { label: '当前程序', done: artifactCurrent && Boolean(hex), active: build.state === 'completed' && !artifactCurrent },
    { label: '写入校验', done: snapshot.state === 'completed', active: ['flashing', 'verifying', 'resetting'].includes(snapshot.state) }
  ]
  return (
    <div className="workbench-content wch-flasher-workbench">
      <div className="wch-hero">
        <div>
          <span className="eyebrow">WCH-Link 烧录器</span>
          <h2>{targetAvailable ? '烧录器和芯片已经握手' : active ? snapshot.message : '把烧录器接成一盏安全指示灯'}</h2>
          <p>这里用于调试、首次写入和串口下载不可用时的维护烧录。写入前会重新检测并校验当前 HEX。</p>
        </div>
        <div className={`wch-socket ${targetAvailable ? 'is-ready' : active ? 'is-active' : ''}`}>
          {active ? <LoaderCircle className="spin" size={24} /> : targetAvailable ? <CheckCircle2 size={24} /> : <Cable size={24} />}
          <span>{snapshot.probe?.adapterName ?? 'WCH-Link'}</span>
        </div>
      </div>

      <div className="wch-step-rail">
        {steps.map((step, index) => (
          <div key={step.label} className={`wch-step ${step.done ? 'done' : ''} ${step.active ? 'active' : ''}`}>
            <strong>{index + 1}</strong>
            <span>{step.label}</span>
          </div>
        ))}
      </div>

      <div className="wch-grid">
        <article className="wch-card">
          <span className="eyebrow">Probe</span>
          <h3><Cpu size={17} /> 探针与芯片状态</h3>
          <dl className="wch-facts">
            <div><dt>烧录器</dt><dd>{snapshot.probe?.adapterName ? `${snapshot.probe.adapterName}${snapshot.probe.adapterMode ? ` · ${snapshot.probe.adapterMode}` : ''}${snapshot.probe.adapterVersion ? ` · ${snapshot.probe.adapterVersion}` : ''}` : '等待检测'}</dd></div>
            <div><dt>芯片</dt><dd>{snapshot.probe?.targetExamined ? `RISC-V${snapshot.probe.xlen ? ` · XLEN ${snapshot.probe.xlen}` : ''}` : '还未识别'}</dd></div>
            <div><dt>Flash</dt><dd>{snapshot.probe?.flashBanks[0] ? `${snapshot.probe.flashBanks[0].name} · ${snapshot.probe.flashBanks[0].size}` : '检测后显示'}</dd></div>
            <div><dt>OpenOCD</dt><dd>{snapshot.probe?.openocdVersion ?? '使用内置 WCH OpenOCD'}</dd></div>
          </dl>
        </article>

        <article className={`wch-card ${artifactCurrent ? 'is-current' : ''}`}>
          <span className="eyebrow">Current program</span>
          <h3><Zap size={17} /> 当前可烧录程序</h3>
          {hex && artifactCurrent ? (
            <div className="wch-artifact">
              <strong>{hex.name}</strong>
              <span>{hex.bytes ? `${Math.round(hex.bytes / 1024)} KB` : '已生成'}{hex.sha256 ? ` · ${hex.sha256.slice(0, 8)}` : ''}</span>
              <small>对应存档 {build.proof?.workspaceCommit.slice(0, 7)} · {build.completedAt ? new Date(build.completedAt).toLocaleString('zh-CN', { hour12: false }) : '刚刚生成'}</small>
            </div>
          ) : (
            <div className="wch-empty-artifact">
              <FileWarning size={18} />
              <span>{build.state === 'completed' ? '程序已过期，请重新生成。' : '还没有可烧录的 HEX 程序。'}</span>
              <button type="button" onClick={onGoBuild}>去生成程序</button>
            </div>
          )}
        </article>
      </div>

      <div className={`wch-result ${snapshot.state === 'failed' ? 'failed' : targetAvailable ? 'ready' : ''}`}>
        <ShieldAlert size={18} />
        <span>{snapshot.message}</span>
      </div>

      <div className="wch-actions">
        <button type="button" className="button-primary" onClick={onProbe} disabled={busy || active}>
          {active && snapshot.state === 'probing' ? <LoaderCircle className="spin" size={15} /> : <Cable size={15} />} 检测烧录器与芯片
        </button>
        <button type="button" onClick={confirmFlash} disabled={!canFlash || busy} title={canFlash ? '写入当前 HEX，并由 OpenOCD 校验后复位。' : '请先检测烧录器，并生成当前工作区的 HEX。'}>
          <Zap size={15} /> 写入当前程序
        </button>
        <button type="button" onClick={onCancel} disabled={!snapshot.canCancel}>
          <Square size={14} /> 停止检测
        </button>
      </div>

      <details className="wch-log" open={snapshot.state === 'failed'}>
        <summary><TerminalSquare size={15} /> 技术细节：OpenOCD 输出</summary>
        <div>
          {snapshot.logs.length === 0 ? <span>检测后这里会显示 OpenOCD 原始输出，方便复制排查。</span> : snapshot.logs.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
        </div>
      </details>
    </div>
  )
}
