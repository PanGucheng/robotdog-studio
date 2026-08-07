import { AlertTriangle, Cable, Check, CheckCircle2, ChevronDown, Circle, Code2, Cpu, FileArchive, GitCommitHorizontal, Hammer, LoaderCircle, RotateCcw, Square, TerminalSquare, Usb, X, Zap } from 'lucide-react'
import type { CandidateSnapshot, DeviceConnectionSnapshot, FirmwareBaselineStatus, FirmwareBuildSnapshot, FirmwareUpdateSnapshot, WchLinkFlashSnapshot, WorkspaceHistoryEntry, WorkspaceSummary } from '../../../shared/types'
import { buildStudentDiagnosticCards } from '../lib/student-diagnostics'

interface McuBuildRunToolProps {
  workspace: WorkspaceSummary
  candidate?: CandidateSnapshot
  build: FirmwareBuildSnapshot
  baseline?: FirmwareBaselineStatus
  connection: DeviceConnectionSnapshot
  update: FirmwareUpdateSnapshot
  wchLink: WchLinkFlashSnapshot
  history: WorkspaceHistoryEntry[]
  busy: boolean
  onShowDiff(): void
  onFocusFile(path: string, line?: number): void
  onBuildCandidate(id: string): void
  onApplyCandidate(id: string): void
  onRejectCandidate(id: string): void
  onUndo(): void
  onBuildFirmware(): void
  onCancelBuild(): void
  onToggleUsb(): void
  onStartUpdate(): void
  onCancelUpdate(): void
  onProbeWchLink(): void
  onFlashWchLink(): void
  onCancelWchLink(): void
}

const candidateActive = new Set<CandidateSnapshot['state']>(['preparing', 'agent_running', 'validating', 'building', 'applying'])
const wchActive = new Set<WchLinkFlashSnapshot['state']>(['probing', 'flashing', 'verifying', 'resetting'])

export function McuBuildRunTool(props: McuBuildRunToolProps): React.JSX.Element {
  const { workspace, candidate, build, baseline, connection, update, wchLink, history, busy } = props
  const artifactCurrent = build.state === 'completed' && Boolean(build.proof && build.proof.workspaceId === workspace.id && build.proof.workspaceCommit === workspace.headCommit && build.proof.firmwareBaselineId === workspace.firmwareBaselineId && build.proof.baselineCommit === workspace.baselineCommit)
  const candidateErrors = buildStudentDiagnosticCards(candidate?.diagnostics ?? []).slice(0, 3)
  const canUndo = history[0]?.message.startsWith('feat(student): apply AI candidate ') ?? false

  if (candidate && !['applied', 'rejected', 'cancelled', 'stale'].includes(candidate.state)) return <div className="mcu-run-tool">
    <RunFlow active="review" />
    {candidateActive.has(candidate.state) ? <StateCard icon={<LoaderCircle className="spin" size={20} />} eyebrow="正在处理修改" title={candidate.state === 'building' ? '正在检查代码' : candidate.state === 'applying' ? '正在保存到项目' : '安全草稿正在准备'} detail="代码主区会保持当前文件，完成后这里给出下一步。" />
      : ['failed', 'conflict', 'no_changes'].includes(candidate.state) || candidate.error ? <>
        <StateCard tone="danger" icon={<AlertTriangle size={20} />} eyebrow="检查未通过" title="先修正最前面的代码问题" detail={candidate.error ?? '候选代码没有通过检查。'} />
        <div className="mcu-diagnostic-list">{candidateErrors.map((item) => <button type="button" key={item.id} onClick={() => item.path && props.onFocusFile(item.path, item.diagnostic.line)}><span>{item.locationLabel}</span><strong>{item.studentMessage}</strong><small>{item.fileLabel}</small></button>)}</div>
        <div className="mcu-primary-actions"><button type="button" onClick={() => props.onRejectCandidate(candidate.id)} disabled={busy}><X size={14} /> 收起这次修改</button></div>
      </> : <>
        <StateCard icon={candidate.state === 'build_passed' ? <CheckCircle2 size={20} /> : <Code2 size={20} />} eyebrow={candidate.state === 'build_passed' ? '代码检查通过' : '等待检查'} title={candidate.state === 'build_passed' ? '确认后保存到项目' : '先检查这次修改能否编译'} detail={`${candidate.validation?.changedFiles ?? 0} 个教学文件发生变化；主代码区可以逐行查看差异。`} />
        <div className="mcu-primary-actions">
          <button type="button" onClick={props.onShowDiff}>查看差异</button>
          <button type="button" onClick={() => props.onRejectCandidate(candidate.id)} disabled={busy}><X size={14} /> 放弃修改</button>
          {candidate.state === 'build_passed'
            ? <button type="button" className="button-primary" onClick={() => props.onApplyCandidate(candidate.id)} disabled={busy}><GitCommitHorizontal size={14} /> 保存到项目</button>
            : <button type="button" className="button-primary" onClick={() => props.onBuildCandidate(candidate.id)} disabled={busy || candidate.state !== 'review_ready'}><Hammer size={14} /> 检查代码</button>}
        </div>
      </>}
    <CandidateDetails candidate={candidate} />
  </div>

  if (build.state === 'running') return <div className="mcu-run-tool"><RunFlow active="build" /><StateCard icon={<LoaderCircle className="spin" size={20} />} eyebrow="正在生成程序" title={build.currentFile ? fileName(build.currentFile) : '准备完整固件'} detail={`${build.completedFiles}/${build.totalFiles || 1} 个编译单元`} /><div className="mcu-build-progress"><i style={{ width: `${build.totalFiles ? (build.completedFiles / build.totalFiles) * 100 : 0}%` }} /></div><div className="mcu-primary-actions"><button type="button" className="button-primary" onClick={props.onCancelBuild}><Square size={14} /> 取消生成</button></div><BuildDetails build={build} /></div>

  if (build.state === 'failed') return <div className="mcu-run-tool"><RunFlow active="build" /><StateCard tone="danger" icon={<AlertTriangle size={20} />} eyebrow="生成失败" title="程序还没有生成" detail={build.error ?? '查看第一条有效错误，修正后重新生成。'} /><div className="mcu-primary-actions"><button type="button" className="button-primary" onClick={props.onBuildFirmware} disabled={busy}><Hammer size={14} /> 重新生成</button></div><BuildDetails build={build} open /></div>

  if (!artifactCurrent) return <div className="mcu-run-tool">
    <RunFlow active="build" />
    <StateCard icon={<Cpu size={20} />} eyebrow={build.state === 'completed' ? '程序已过期' : '下一步'} title={build.state === 'completed' ? '代码已变化，需要重新生成' : '生成当前工程的程序'} detail="系统会合并课程代码与只读主固件，生成可写入开发板的程序。" />
    <div className="mcu-primary-actions"><button type="button" className="button-primary" onClick={props.onBuildFirmware} disabled={busy}><Hammer size={14} /> 生成程序</button></div>
    {canUndo && <details className="mcu-tech-details"><summary><RotateCcw size={14} /> 项目存档</summary><button type="button" onClick={props.onUndo} disabled={busy}>撤回上次保存</button></details>}
  </div>

  const flashBytes = (build.size?.text ?? 0) + (build.size?.data ?? 0)
  const ramBytes = (build.size?.data ?? 0) + (build.size?.bss ?? 0)
  const flashCapacity = baseline?.memory.flashBytes ?? 65536
  const ramCapacity = baseline?.memory.ramBytes ?? 20480
  const targetReady = wchLink.state === 'target_ready' || wchLink.state === 'completed'
  const usbReady = ['connected', 'bootloader'].includes(connection.updatePort.state)
  const flashing = wchActive.has(wchLink.state) || !['idle', 'completed', 'failed', 'cancelled'].includes(update.state)
  const flashed = wchLink.state === 'completed' || update.state === 'completed'
  return <div className="mcu-run-tool">
    <RunFlow active={flashed ? 'complete' : 'flash'} />
    <StateCard icon={flashed ? <CheckCircle2 size={20} /> : <Check size={20} />} eyebrow={flashed ? '写入完成' : '程序已生成'} title={flashed ? '开发板已经写入当前程序' : '可以连接开发板验证'} detail={flashed ? (wchLink.state === 'completed' ? wchLink.message : update.message) : `对应当前项目存档 ${workspace.headCommit.slice(0, 7)}`} />
    <div className="mcu-memory-summary">
      <MemoryBar label="Flash" value={flashBytes} capacity={flashCapacity} />
      <MemoryBar label="RAM" value={ramBytes} capacity={ramCapacity} />
    </div>
    <div className="mcu-device-status"><span className={targetReady || usbReady ? 'is-ready' : ''}><Cable size={15} /> {targetReady ? 'WCH-Link 与芯片已连接' : usbReady ? 'USB 下载端口已连接' : '尚未检测到开发板'}</span></div>
    <div className="mcu-primary-actions">
      {flashing ? <button type="button" className="button-primary" onClick={wchActive.has(wchLink.state) ? props.onCancelWchLink : props.onCancelUpdate}><Square size={14} /> 取消写入</button>
        : targetReady ? <button type="button" className="button-primary" onClick={props.onFlashWchLink} disabled={busy}><Zap size={14} /> 写入开发板</button>
          : usbReady ? <button type="button" className="button-primary" onClick={props.onStartUpdate} disabled={busy}><Usb size={14} /> 通过 USB 写入</button>
            : <button type="button" className="button-primary" onClick={props.onProbeWchLink} disabled={busy}><Cable size={14} /> 检测开发板</button>}
    </div>
    <details className="mcu-tech-details"><summary><ChevronDown size={14} /> 其他连接方式</summary><button type="button" onClick={props.onToggleUsb}>{usbReady ? '断开模拟 USB' : '连接模拟 USB'}</button>{!targetReady && <button type="button" onClick={props.onProbeWchLink}>重新检测 WCH-Link</button>}</details>
    <BuildDetails build={build} />
    {(wchLink.logs.length > 0 || wchLink.error) && <details className="mcu-tech-details" open={wchLink.state === 'failed'}><summary><TerminalSquare size={14} /> 烧录技术详情</summary>{wchLink.error && <p className="is-error">{wchLink.error}</p>}<pre>{wchLink.logs.join('\n')}</pre></details>}
  </div>
}

function RunFlow({ active }: { active: 'review' | 'build' | 'flash' | 'complete' }): React.JSX.Element {
  const order = ['review', 'build', 'flash'] as const
  const activeIndex = active === 'complete' ? 3 : order.indexOf(active)
  return <div className="mcu-run-flow" aria-label="修改、编译、烧录流程">{order.map((id, index) => <span key={id} className={index < activeIndex ? 'done' : index === activeIndex ? 'active' : ''}><i>{index < activeIndex ? <Check size={11} /> : index + 1}</i>{id === 'review' ? '修改' : id === 'build' ? '编译' : '烧录'}</span>)}</div>
}

function StateCard({ icon, eyebrow, title, detail, tone = 'normal' }: { icon: React.ReactNode; eyebrow: string; title: string; detail: string; tone?: 'normal' | 'danger' }): React.JSX.Element {
  return <section className={`mcu-state-card ${tone === 'danger' ? 'is-danger' : ''}`}><span>{icon}</span><div><small>{eyebrow}</small><h2>{title}</h2><p>{detail}</p></div></section>
}

function MemoryBar({ label, value, capacity }: { label: string; value: number; capacity: number }): React.JSX.Element {
  const percent = Math.min(100, Math.round((value / capacity) * 100))
  return <div><span><strong>{label}</strong><small>{formatBytes(value)} / {formatBytes(capacity)}</small></span><i><b style={{ width: `${percent}%` }} /></i></div>
}

function BuildDetails({ build, open = false }: { build: FirmwareBuildSnapshot; open?: boolean }): React.JSX.Element {
  return <details className="mcu-tech-details" open={open}><summary><FileArchive size={14} /> 技术详情</summary>{build.artifacts.length > 0 && <ul>{build.artifacts.map((item) => <li key={item.kind}><strong>{item.kind.toUpperCase()}</strong>{item.name}{item.bytes ? ` · ${formatBytes(item.bytes)}` : ''}</li>)}</ul>}<pre>{build.logs.length ? build.logs.join('\n') : '还没有构建日志。'}</pre></details>
}

function CandidateDetails({ candidate }: { candidate: CandidateSnapshot }): React.JSX.Element {
  return <details className="mcu-tech-details"><summary><ChevronDown size={14} /> 修改详情</summary><ul>{candidate.validation?.files.map((file) => <li key={file.path}><strong>{file.path}</strong>+{file.additions} / −{file.deletions}</li>) ?? <li>安全草稿正在准备。</li>}</ul></details>
}

function fileName(path: string): string { return path.split(/[\\/]/).at(-1) ?? path }
function formatBytes(value: number): string { return value >= 1024 ? `${(value / 1024).toFixed(value >= 10240 ? 0 : 1)} KB` : `${value} B` }
