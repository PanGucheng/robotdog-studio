import { Bot, Check, ChevronRight, Code2, Cpu, FileCheck2, GraduationCap, RotateCcw, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'

export type LearningDestination = 'chat' | '编写代码' | '修改确认' | '编译 / 烧录'

interface LearningCenterProps {
  open: boolean
  onClose(): void
  onNavigate(destination: LearningDestination): void
}

const STORAGE_KEY = 'robotdog.learning-progress.v1'
const tasks = [
  { id: 'ai-parameter', icon: Bot, title: '让 AI 调一次参数', time: '约 2 分钟', destination: 'chat' as const, instruction: '告诉 AI：“把转弯强度轻微降低 2”。AI 只在安全副本里工作，最后会把所有修改放在一起给你看。' },
  { id: 'review', icon: FileCheck2, title: '看懂修改并保存', time: '约 2 分钟', destination: '修改确认' as const, instruction: '在“修改确认”中对照修改前后。确认无误后再保存到项目；不满意可以直接放弃。' },
  { id: 'code', icon: Code2, title: '自己写一小段代码', time: '约 3 分钟', destination: '编写代码' as const, instruction: '打开“小马怎么走”，点击“开始编写”。所有输入会自动保存在安全草稿中，不会碰到硬件和烧录设置。' },
  { id: 'diagnostic', icon: Sparkles, title: '请 AI 帮忙修一个错误', time: '约 2 分钟', destination: '编写代码' as const, instruction: '少写一个分号再检查代码。系统会标出关键错误，AI 先解释原因；只有点击“接受建议并修复草稿”后，它才会动手修改安全草稿。' },
  { id: 'firmware', icon: Cpu, title: '生成完整固件', time: '约 3 分钟', destination: '编译 / 烧录' as const, instruction: '点击“编译固件”。程序会把学生代码和只读 SDK 合在临时目录中，生成 ELF、HEX、BIN、MAP 和身份校验记录。' }
]

export function LearningCenter({ open, onClose, onNavigate }: LearningCenterProps): React.JSX.Element | null {
  const [selectedId, setSelectedId] = useState(tasks[0].id)
  const [completed, setCompleted] = useState<string[]>(() => readProgress())
  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0]
  const SelectedIcon = selected.icon
  const progress = Math.round((completed.length / tasks.length) * 100)
  const complete = (): void => {
    const next = completed.includes(selected.id) ? completed : [...completed, selected.id]
    setCompleted(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  const reset = (): void => { setCompleted([]); localStorage.removeItem(STORAGE_KEY); setSelectedId(tasks[0].id) }
  const nextTask = useMemo(() => tasks.find((task) => !completed.includes(task.id)), [completed])
  if (!open) return null
  return (
    <div className="learning-overlay" role="dialog" aria-modal="true" aria-labelledby="learning-title">
      <div className="learning-center">
        <header className="learning-header">
          <span className="learning-mark"><GraduationCap size={22} /></span>
          <div><span className="eyebrow">操作示范</span><h2 id="learning-title">陪小马跑完第一次代码训练</h2><p>可以随时退出，以后从“操作示范”继续。</p></div>
          <button type="button" className="learning-close" aria-label="关闭操作示范" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="learning-progress"><span><i style={{ width: `${progress}%` }} /></span><strong>{completed.length}/{tasks.length} 已完成</strong></div>
        <div className="learning-body">
          <nav aria-label="示范任务">
            {tasks.map((task) => <button type="button" key={task.id} className={selected.id === task.id ? 'active' : ''} onClick={() => setSelectedId(task.id)}>
              <span className={completed.includes(task.id) ? 'done' : ''}>{completed.includes(task.id) ? <Check size={14} /> : <task.icon size={15} />}</span>
              <span><strong>{task.title}</strong><small>{task.time}</small></span><ChevronRight size={14} />
            </button>)}
          </nav>
          <section className="learning-task">
            <SelectedIcon size={28} />
            <span className="eyebrow">当前任务</span>
            <h3>{selected.title}</h3>
            <p>{selected.instruction}</p>
            <div className="learning-vocabulary">
              <strong>这一步会遇到的词</strong>
              <span><b>安全副本</b>可以放心试错的一份代码复印件</span>
              <span><b>检查代码</b>把代码翻译给芯片前，先找出看不懂的地方</span>
              <span><b>固件</b>最终放进小马芯片里运行的程序</span>
            </div>
            <div className="learning-actions">
              <button type="button" onClick={() => { onNavigate(selected.destination); onClose() }}>去这个页面练习</button>
              <button type="button" className="button-primary" onClick={complete} disabled={completed.includes(selected.id)}>{completed.includes(selected.id) ? <><Check size={14} /> 已完成</> : '我完成了这一步'}</button>
            </div>
            {nextTask && completed.includes(selected.id) && <button type="button" className="learning-next" onClick={() => setSelectedId(nextTask.id)}>继续：{nextTask.title} <ChevronRight size={13} /></button>}
          </section>
        </div>
        <footer><button type="button" onClick={reset}><RotateCcw size={13} /> 教师重置进度</button><span>示范只使用学生代码和模拟设备，不会连接或烧录真实硬件。</span></footer>
      </div>
    </div>
  )
}

function readProgress(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && tasks.some((task) => task.id === id)) : []
  } catch { return [] }
}
