import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Footprints, PlugZap, ScanLine, ShieldAlert } from 'lucide-react'
import type { RobotAction } from '../../../shared/types'

interface ControlDockProps {
  connected: boolean
  busy: boolean
  onConnect(): void
  onCapture(): void
  onAction(action: RobotAction): void
}

export function ControlDock({ connected, busy, onConnect, onCapture, onAction }: ControlDockProps): React.JSX.Element {
  return (
    <footer className="control-dock">
      <div className="dock-group connection-actions">
        <button type="button" className={`dock-button ${connected ? 'connected' : ''}`} onClick={onConnect} disabled={busy}>
          <PlugZap size={18} /> {connected ? '已连接' : '连接小马'}
        </button>
        <button type="button" className="dock-button" onClick={onCapture} disabled={!connected || busy}>
          <ScanLine size={18} /> 检测黑线
        </button>
      </div>
      <div className="dock-divider" />
      <div className="dock-group movement-actions">
        <button type="button" className="icon-command" title="左转" onClick={() => onAction('turnl')} disabled={!connected}><ArrowLeft /></button>
        <button type="button" className="icon-command" title="前进" onClick={() => onAction('walk')} disabled={!connected}><ArrowUp /></button>
        <button type="button" className="icon-command" title="后退" onClick={() => onAction('back')} disabled={!connected}><ArrowDown /></button>
        <button type="button" className="icon-command" title="右转" onClick={() => onAction('turnr')} disabled={!connected}><ArrowRight /></button>
        <button type="button" className="dock-button" onClick={() => onAction('stand')} disabled={!connected}><Footprints size={18} /> 站立</button>
      </div>
      <div className="dock-spacer" />
      <button type="button" className="stop-button" onClick={() => onAction('stop')} disabled={!connected}>
        <ShieldAlert size={19} /> 停止动作
      </button>
    </footer>
  )
}
