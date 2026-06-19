import { CheckCircle2, LoaderCircle, LockKeyhole, RotateCcw, ShieldCheck, Square } from 'lucide-react'
import type { RecoverySnapshot } from '../../../shared/types'

interface RecoveryPanelProps {
  recovery: RecoverySnapshot
  busy: boolean
  onStart(): void
  onCancel(): void
}

export function RecoveryPanel({ recovery, busy, onStart, onCancel }: RecoveryPanelProps): React.JSX.Element {
  const active = !['idle', 'completed', 'failed', 'cancelled'].includes(recovery.state)
  return (
    <section className="recovery-panel">
      <div className="recovery-summary">
        <span className="recovery-seal"><LockKeyhole size={15} /></span>
        <span><strong>教师维护封签</strong><small>完整恢复 Bootloader 与出厂固件</small></span>
        <span className={`recovery-state ${recovery.state === 'completed' ? 'complete' : ''}`}>
          {active ? '恢复中' : recovery.state === 'completed' ? '已验证' : '仅教师'}
        </span>
      </div>
      <div className="recovery-body">
        <div className="recovery-copy">
          <span className="eyebrow">WCH-Link 恢复模拟</span>
          <h3>{recovery.message}</h3>
          <p>只在普通 USB 下载无法恢复时使用。学生模式、AI 和日常下载不能调用此操作。</p>
        </div>
        <div className="recovery-meter"><span style={{ width: `${recovery.progress}%` }} /></div>
        <div className="recovery-meta">
          <span>{recovery.imageName ?? 'RobotDog-Factory-Full.hex'}</span>
          <strong>{recovery.progress}%</strong>
        </div>
        <div className="recovery-actions">
          {recovery.canCancel && <button type="button" onClick={onCancel}><Square size={13} /> 安全取消</button>}
          <button type="button" className="recovery-primary" onClick={onStart} disabled={active || busy}>
            {active ? <LoaderCircle className="spin" size={15} /> : recovery.state === 'completed' ? <CheckCircle2 size={15} /> : <RotateCcw size={15} />}
            {recovery.state === 'completed' ? '再次验证恢复' : '开始模拟恢复'}
          </button>
        </div>
        {recovery.state === 'completed' && <div className="recovery-proof"><ShieldCheck size={15} /> Bootloader、APP 与启动验证均已完成。</div>}
      </div>
    </section>
  )
}
