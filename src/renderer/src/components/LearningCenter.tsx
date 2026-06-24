import { Bot, Check, ChevronRight, Code2, Cpu, FileCheck2, GraduationCap, Play, RotateCcw, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'

export type LearningDestination = 'chat' | '编写代码' | '修改确认' | '编译 / 烧录'

interface LearningCenterProps {
  open: boolean
  onClose(): void
  onNavigate(destination: LearningDestination): void
}

interface LearningStep {
  id: string
  title: string
  destination: LearningDestination
  instruction: string
  target: string
  success: string
  tip: string
  sample?: string
}

interface LearningTask {
  id: string
  icon: typeof Bot
  title: string
  time: string
  steps: LearningStep[]
  vocabulary: Array<{ term: string; meaning: string }>
}

const STORAGE_KEY = 'robotdog.learning-progress.v2'
const LEGACY_STORAGE_KEY = 'robotdog.learning-progress.v1'

export const learningTasks: LearningTask[] = [
  {
    id: 'ai-parameter',
    icon: Bot,
    title: '让 AI 调一次参数',
    time: '约 3 分钟',
    steps: [
      {
        id: 'open-chat',
        title: '先来到 AI 助教',
        destination: 'chat',
        instruction: '确认左侧是“把想法说给小马听”的聊天框。如果还没有学生对话，先点顶部“新对话”。',
        target: '左侧 AI 助教聊天框',
        success: '能在输入框里看到“继续追问，或提出下一步修改…”',
        tip: '每个新对话都会复制一份安全代码模板，不会和别的练习混在一起。'
      },
      {
        id: 'send-prompt',
        title: '发出一个小修改',
        destination: 'chat',
        instruction: '把下面这句话发给 AI，让它只调巡线参数。',
        target: 'AI 输入框',
        success: 'AI 回复后，右侧会出现“修改确认”或提示你去检查代码。',
        tip: 'AI 只在安全草稿里工作，正式项目还没有变化。',
        sample: '请把机器马巡线的转弯强度轻微降低 2，并用一句中文注释说明这样做是为了减少过弯摆动。'
      },
      {
        id: 'go-review',
        title: '去看这次修改',
        destination: '修改确认',
        instruction: '切到“修改确认”，先看改动清单，不急着保存。',
        target: '右侧“修改确认”页',
        success: '能看到修改前和安全草稿的逐行对比。',
        tip: '如果看不懂，先不要保存，可以回到聊天框继续问。'
      }
    ],
    vocabulary: [
      { term: '安全草稿', meaning: '可以放心试错的一份代码复印件' },
      { term: '修改确认', meaning: '保存到项目之前，先看清楚改了哪里' },
      { term: '参数', meaning: '控制小马动作强弱、目标位置这类数值' }
    ]
  },
  {
    id: 'review',
    icon: FileCheck2,
    title: '看懂修改并保存',
    time: '约 2 分钟',
    steps: [
      {
        id: 'compare',
        title: '先比较两边',
        destination: '修改确认',
        instruction: '左边是修改前，右边是安全草稿。先找绿色新增和红色删除。',
        target: '逐行修改对比',
        success: '能说出这次改了哪个文件、哪个数值或哪一小段代码。',
        tip: '只保存你看得懂、愿意让小马试的修改。'
      },
      {
        id: 'check-code',
        title: '检查代码',
        destination: '修改确认',
        instruction: '如果按钮显示“检查代码”，先点击它，让系统确认这次修改能被芯片看懂。',
        target: '底部“检查代码”按钮',
        success: '按钮变成“保存到项目”，或界面给出清楚的问题说明。',
        tip: '检查失败不会影响正式项目，错误还停留在安全草稿里。'
      },
      {
        id: 'save',
        title: '保存到项目',
        destination: '修改确认',
        instruction: '确认无误后点击“保存到项目”。保存后会产生本机存档，可以撤回。',
        target: '底部“保存到项目”按钮',
        success: '顶部存档号更新，页面自动引导你去“生成程序”。',
        tip: '保存不是烧录；真正下载到小马之前还会有下一步。'
      }
    ],
    vocabulary: [
      { term: '保存到项目', meaning: '把安全草稿正式写入这次练习' },
      { term: '本机存档', meaning: '每次保存都会留一条可撤回记录' },
      { term: '检查代码', meaning: '生成程序前，先找出代码是否写错' }
    ]
  },
  {
    id: 'code',
    icon: Code2,
    title: '自己写一小段代码',
    time: '约 4 分钟',
    steps: [
      {
        id: 'open-editor',
        title: '打开编写代码',
        destination: '编写代码',
        instruction: '来到“编写代码”页，先观察左侧文件分组：控制逻辑、参数设置、参考接口。',
        target: '右侧“编写代码”页',
        success: '能看到代码编辑器和“开始编写”按钮。',
        tip: '参考接口只能查看，能帮助你知道哪些函数和数据可以用。'
      },
      {
        id: 'start-draft',
        title: '进入安全草稿',
        destination: '编写代码',
        instruction: '点击“开始编写”。这一步之后，你的输入会自动保存到安全草稿。',
        target: '右上角“开始编写”按钮',
        success: '顶部状态显示“草稿已保存”或“正在保存草稿”。',
        tip: '不点“保存到项目”之前，正式项目还是原来的样子。'
      },
      {
        id: 'check-draft',
        title: '检查并查看修改',
        destination: '编写代码',
        instruction: '改一小处后点击“检查并查看修改”，再去“修改确认”看对比。',
        target: '右上角“检查并查看修改”按钮',
        success: '检查通过后进入“修改确认”，失败时出现问题卡和 AI 解释入口。',
        tip: '一次只改一个小地方，最容易知道小马动作为什么变了。'
      }
    ],
    vocabulary: [
      { term: '控制逻辑', meaning: '决定小马看到黑线后怎么走的代码' },
      { term: '参数设置', meaning: '适合初学者调整的数值文件' },
      { term: '参考接口', meaning: '告诉你能用哪些输入和动作的说明书' }
    ]
  },
  {
    id: 'diagnostic',
    icon: Sparkles,
    title: '请 AI 帮忙修一个错误',
    time: '约 3 分钟',
    steps: [
      {
        id: 'make-safe-error',
        title: '制造一个可恢复的小错误',
        destination: '编写代码',
        instruction: '在安全草稿里少写一个分号，或把变量名故意拼错一处。',
        target: '代码编辑器',
        success: '点击“检查并查看修改”后，出现“代码在这里卡住了”。',
        tip: '这是练习错误处理，不会写进正式项目。'
      },
      {
        id: 'read-errors',
        title: '先看关键问题',
        destination: '编写代码',
        instruction: '先读最上面的 1 到 3 条问题，点击问题卡可以跳到对应文件。',
        target: '编译错误问题卡',
        success: '能找到系统标出的行号和“建议怎么改”。',
        tip: '完整编译输出藏在折叠区，老师需要时再展开。'
      },
      {
        id: 'ask-ai',
        title: '让 AI 解释或试修',
        destination: '编写代码',
        instruction: '先点“重新解释”，看懂后再点“接受建议并修复草稿”。',
        target: '错误卡底部按钮',
        success: 'AI 只修改安全草稿；修完后仍需要再次检查和确认。',
        tip: '如果 AI 修过一次还失败，继续看完整输出或把错误发给老师。'
      }
    ],
    vocabulary: [
      { term: '编译器', meaning: '把代码翻译成芯片程序的工具' },
      { term: '行号', meaning: '帮助你定位问题的大概位置' },
      { term: 'AI 试修', meaning: '按建议改安全草稿，不会直接保存到项目' }
    ]
  },
  {
    id: 'firmware',
    icon: Cpu,
    title: '生成小马程序',
    time: '约 3 分钟',
    steps: [
      {
        id: 'open-build',
        title: '来到编译 / 烧录',
        destination: '编译 / 烧录',
        instruction: '打开“编译 / 烧录”页，确认工具链和临时 SDK 都显示可用。',
        target: '编译 / 烧录页',
        success: '能看到“生成程序”按钮和 ELF / HEX / BIN / MAP 产物区。',
        tip: '现在仍是模拟下载，不会连接真实硬件。'
      },
      {
        id: 'build',
        title: '生成程序',
        destination: '编译 / 烧录',
        instruction: '点击“生成程序”。系统会把学生代码和只读 SDK 合在临时目录里构建。',
        target: '“生成程序”按钮',
        success: '生成完成后，产物区出现 ELF、HEX、BIN、MAP。',
        tip: 'BIN 是未来下载到小马芯片里的主要程序文件。'
      },
      {
        id: 'simulate-download',
        title: '进入模拟下载',
        destination: '编译 / 烧录',
        instruction: '程序生成后，可以模拟接线并点击“下载到小马”。',
        target: 'USB 下载区域',
        success: '下载流程会走完停机、写入、校验、重启验证这些步骤。',
        tip: '正式硬件接入后，这里才会换成真实串口下载。'
      }
    ],
    vocabulary: [
      { term: '小马程序', meaning: '最终放进芯片里运行的程序文件' },
      { term: 'BIN', meaning: '未来真正下载到芯片里的二进制程序' },
      { term: '模拟下载', meaning: '先练流程，不操作真实硬件' }
    ]
  }
]

const allStepKeys = new Set(learningTasks.flatMap((task) => task.steps.map((step) => progressKey(task.id, step.id))))

export function LearningCenter({ open, onClose, onNavigate }: LearningCenterProps): React.JSX.Element | null {
  const [selectedId, setSelectedId] = useState(learningTasks[0].id)
  const [completedSteps, setCompletedSteps] = useState<string[]>(() => readProgress())
  const [stepIndexByTask, setStepIndexByTask] = useState<Record<string, number>>({})
  const selected = learningTasks.find((task) => task.id === selectedId) ?? learningTasks[0]
  const SelectedIcon = selected.icon
  const selectedStepIndex = Math.min(stepIndexByTask[selected.id] ?? firstIncompleteStepIndex(selected, completedSteps), selected.steps.length - 1)
  const selectedStep = selected.steps[selectedStepIndex]
  const selectedProgress = getLearningTaskProgress(selected, completedSteps)
  const completedCount = completedSteps.filter((key) => allStepKeys.has(key)).length
  const totalSteps = allStepKeys.size
  const progress = Math.round((completedCount / totalSteps) * 100)
  const nextTask = useMemo(() => learningTasks.find((task) => getLearningTaskProgress(task, completedSteps).done < task.steps.length), [completedSteps])
  const currentStepDone = completedSteps.includes(progressKey(selected.id, selectedStep.id))

  const persist = (next: string[]): void => {
    const normalized = [...new Set(next.filter((key) => allStepKeys.has(key)))]
    setCompletedSteps(normalized)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  }

  const completeStep = (): void => {
    const key = progressKey(selected.id, selectedStep.id)
    const next = completedSteps.includes(key) ? completedSteps : [...completedSteps, key]
    persist(next)
    const nextIndex = Math.min(selectedStepIndex + 1, selected.steps.length - 1)
    setStepIndexByTask((current) => ({ ...current, [selected.id]: nextIndex }))
  }

  const reset = (): void => {
    setCompletedSteps([])
    setStepIndexByTask({})
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    setSelectedId(learningTasks[0].id)
  }

  const openPractice = (): void => {
    onNavigate(selectedStep.destination)
    onClose()
  }

  if (!open) return null
  return (
    <div className="learning-overlay" role="dialog" aria-modal="true" aria-labelledby="learning-title">
      <div className="learning-center">
        <header className="learning-header">
          <span className="learning-mark"><GraduationCap size={22} /></span>
          <div><span className="eyebrow">操作示范</span><h2 id="learning-title">陪小马跑完第一次代码训练</h2><p>每个任务拆成真实点击步骤；可以随时退出，以后继续。</p></div>
          <button type="button" className="learning-close" aria-label="关闭操作示范" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="learning-progress"><span><i style={{ width: `${progress}%` }} /></span><strong>{completedCount}/{totalSteps} 个步骤</strong></div>
        <div className="learning-body">
          <nav aria-label="示范任务">
            {learningTasks.map((task) => {
              const Icon = task.icon
              const taskProgress = getLearningTaskProgress(task, completedSteps)
              const complete = taskProgress.done === taskProgress.total
              return (
                <button type="button" key={task.id} className={selected.id === task.id ? 'active' : ''} onClick={() => setSelectedId(task.id)}>
                  <span className={complete ? 'done' : ''}>{complete ? <Check size={14} /> : <Icon size={15} />}</span>
                  <span><strong>{task.title}</strong><small>{task.time} · {taskProgress.done}/{taskProgress.total} 步</small></span><ChevronRight size={14} />
                </button>
              )
            })}
          </nav>
          <section className="learning-task">
            <SelectedIcon size={28} />
            <span className="eyebrow">当前任务</span>
            <h3>{selected.title}</h3>
            <div className="learning-step-rail" aria-label="当前任务步骤">
              {selected.steps.map((step, index) => {
                const done = completedSteps.includes(progressKey(selected.id, step.id))
                return (
                  <button type="button" key={step.id} className={`${index === selectedStepIndex ? 'active' : ''} ${done ? 'done' : ''}`} onClick={() => setStepIndexByTask((current) => ({ ...current, [selected.id]: index }))}>
                    <span>{done ? <Check size={12} /> : index + 1}</span>
                    <strong>{step.title}</strong>
                  </button>
                )
              })}
            </div>
            <article className="learning-step-card">
              <span className="eyebrow">第 {selectedStepIndex + 1} 步 / {selected.steps.length}</span>
              <h4>{selectedStep.title}</h4>
              <p>{selectedStep.instruction}</p>
              {selectedStep.sample && <div className="learning-sample"><strong>可以直接试这句话</strong><code>{selectedStep.sample}</code></div>}
              <div className="learning-step-grid">
                <span><b>去哪里</b>{selectedStep.target}</span>
                <span><b>完成标志</b>{selectedStep.success}</span>
                <span><b>小提示</b>{selectedStep.tip}</span>
              </div>
            </article>
            <div className="learning-vocabulary">
              <strong>这一步会遇到的词</strong>
              {selected.vocabulary.map((item) => <span key={item.term}><b>{item.term}</b>{item.meaning}</span>)}
            </div>
            <div className="learning-actions">
              <button type="button" onClick={openPractice}><Play size={14} /> 打开页面练习</button>
              <button type="button" className="button-primary" onClick={completeStep} disabled={currentStepDone}>{currentStepDone ? <><Check size={14} /> 这一步已完成</> : '我完成了这一步'}</button>
            </div>
            {currentStepDone && selectedStepIndex < selected.steps.length - 1 && <button type="button" className="learning-next" onClick={() => setStepIndexByTask((current) => ({ ...current, [selected.id]: selectedStepIndex + 1 }))}>继续下一步 <ChevronRight size={13} /></button>}
            {selectedProgress.done === selectedProgress.total && nextTask && nextTask.id !== selected.id && <button type="button" className="learning-next" onClick={() => setSelectedId(nextTask.id)}>继续：{nextTask.title} <ChevronRight size={13} /></button>}
          </section>
        </div>
        <footer><button type="button" onClick={reset}><RotateCcw size={13} /> 教师重置进度</button><span>示范只使用学生代码和模拟设备，不会连接或烧录真实硬件。</span></footer>
      </div>
    </div>
  )
}

export function progressKey(taskId: string, stepId: string): string {
  return `${taskId}/${stepId}`
}

export function getLearningTaskProgress(task: LearningTask, completedSteps: string[]): { done: number; total: number } {
  const done = task.steps.filter((step) => completedSteps.includes(progressKey(task.id, step.id))).length
  return { done, total: task.steps.length }
}

export function expandStoredLearningProgress(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const next = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    if (allStepKeys.has(item)) {
      next.add(item)
      continue
    }
    const legacyTask = learningTasks.find((task) => task.id === item)
    if (legacyTask) {
      for (const step of legacyTask.steps) next.add(progressKey(legacyTask.id, step.id))
    }
  }
  return [...next]
}

function firstIncompleteStepIndex(task: LearningTask, completedSteps: string[]): number {
  const index = task.steps.findIndex((step) => !completedSteps.includes(progressKey(task.id, step.id)))
  return index === -1 ? task.steps.length - 1 : index
}

function readProgress(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
    return expandStoredLearningProgress(JSON.parse(raw ?? '[]'))
  } catch { return [] }
}
