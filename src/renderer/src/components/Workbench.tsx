import { Activity, Code2, Cpu, Gauge, ScrollText, Settings2, TerminalSquare } from 'lucide-react'
import type { CcdFrame, LogEntry, RobotStatus } from '../../../shared/types'
import { CcdPlot } from './CcdPlot'

interface WorkbenchProps {
  frame: CcdFrame
  status: RobotStatus
  logs: LogEntry[]
}

const tabs = [
  ['巡线参数', Gauge],
  ['CCD 曲线', Activity],
  ['串口日志', TerminalSquare],
  ['编译 / 烧录', Cpu],
  ['代码修改', Code2],
  ['设置', Settings2]
] as const

export function Workbench({ frame, status, logs }: WorkbenchProps): React.JSX.Element {
  const error = frame.center - frame.target
  return (
    <section className="workbench">
      <nav className="workbench-tabs" aria-label="工作台标签">
        {tabs.map(([label, Icon]) => (
          <button type="button" className={label === 'CCD 曲线' ? 'active' : ''} key={label}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

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
    </section>
  )
}
