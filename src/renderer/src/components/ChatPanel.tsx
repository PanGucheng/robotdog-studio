import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp, Bot, CheckCircle2, FileCheck2, KeyRound, LoaderCircle, Settings2, ShieldCheck, Sparkles, Square } from 'lucide-react'
import type { AgentEvent, AgentRuntimeStatus, CandidateSnapshot, WorkspaceSummary } from '../../../shared/types'
import { getRobotApi } from '../lib/browser-demo-api'
import { toStudentErrorMessage, toStudentProblem } from '../lib/student-errors'
import { ProblemCard } from './ProblemCard'

interface ChatPanelProps {
  workspace?: WorkspaceSummary
  events: AgentEvent[]
  candidate?: CandidateSnapshot
  running: boolean
  onPrompt(message: string): void
  onCancel(): void
  onReject(candidateId: string): void
  onPermission(requestId: string, optionId: string): void
}

interface ConversationTurn {
  turnId: string
  started: Extract<AgentEvent, { type: 'turn_started' }>
  plan?: Extract<AgentEvent, { type: 'plan' }>
  activity?: Extract<AgentEvent, { type: 'activity' }>
  terminal?: Extract<AgentEvent, { type: 'completed' | 'cancelled' | 'failed' }>
  permission?: Extract<AgentEvent, { type: 'permission_request' }>
  assistantText: string
  summary?: string
}

export function ChatPanel({ workspace, events, candidate, running, onPrompt, onCancel, onReject, onPermission }: ChatPanelProps): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [showReview, setShowReview] = useState(false)
  const [showRuntime, setShowRuntime] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [runtime, setRuntime] = useState<AgentRuntimeStatus>()
  const [runtimeError, setRuntimeError] = useState('')
  const conversationRef = useRef<HTMLDivElement>(null)
  const turns = useMemo(() => buildConversation(events), [events])
  const latestTurnId = turns.at(-1)?.turnId

  useEffect(() => { void getRobotApi().getAgentRuntimeStatus().then(setRuntime).catch(() => undefined) }, [])
  useEffect(() => {
    const element = conversationRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [events])

  async function saveApiKey(): Promise<void> {
    setRuntimeError('')
    try { setRuntime(await getRobotApi().setAgentApiKey(apiKey)); setApiKey('') } catch (caught) { setRuntimeError(toStudentErrorMessage(caught)) }
  }

  async function clearApiKey(): Promise<void> {
    setRuntimeError('')
    try { setRuntime(await getRobotApi().clearAgentApiKey()) } catch (caught) { setRuntimeError(toStudentErrorMessage(caught)) }
  }

  function submit(): void {
    const trimmed = message.trim()
    if (!trimmed || running || !workspace) return
    setShowReview(false)
    setMessage('')
    onPrompt(trimmed)
  }

  return (
    <section className="chat-panel">
      <div className="section-heading">
        <div><span className="eyebrow">AI 助教</span><h2>把想法说给小马听</h2></div>
        <button type="button" className={`model-chip ${runtime?.ready ? 'ready' : ''}`} onClick={() => setShowRuntime((value) => !value)} aria-expanded={showRuntime}>
          {runtime?.ready ? <Sparkles size={14} /> : <Settings2 size={14} />} {runtime?.adapter === 'reasonix' ? `Reasonix ${runtime.version}` : '模拟教学'}
        </button>
      </div>

      {showRuntime && runtime?.adapter === 'reasonix' && (
        <div className="runtime-card">
          <div><KeyRound size={16} /><span><strong>DeepSeek 访问密钥</strong><small>{runtime.detail}。密钥由 Windows 加密存储，界面不会再次读取。</small></span></div>
          <input type="password" value={apiKey} placeholder={runtime.apiKeyConfigured ? '已配置；输入新密钥可替换' : 'sk-…'} autoComplete="off" onChange={(event) => setApiKey(event.target.value)} />
          {runtimeError && <small className="runtime-error">{runtimeError}</small>}
          <div className="runtime-actions"><button type="button" onClick={() => void clearApiKey()} disabled={!runtime.apiKeyConfigured}>清除密钥</button><button type="button" className="button-primary" onClick={() => void saveApiKey()} disabled={!apiKey.trim()}>安全保存</button></div>
        </div>
      )}

      <div ref={conversationRef} className="conversation" aria-live="polite">
        {turns.length === 0 && <div className="chat-welcome"><span className="assistant-mark"><Bot size={16} /></span><div><strong>先说一个你观察到的问题</strong><p>我会在安全副本中一次完成允许的修改，最后再请你统一查看和确认。</p></div></div>}
        {turns.map((turn) => (
          <TurnView
            key={turn.turnId}
            turn={turn}
            candidate={turn.turnId === latestTurnId ? candidate : undefined}
            running={running && turn.turnId === latestTurnId}
            showReview={showReview}
            onToggleReview={() => setShowReview((value) => !value)}
            onReject={onReject}
            onPermission={onPermission}
          />
        ))}
      </div>

      <div className="prompt-box">
        <textarea aria-label="告诉 AI 你希望机器马做什么" placeholder={workspace ? '继续追问，或提出下一步修改…' : '请先新建一个训练项目'} rows={3} value={message} disabled={!workspace || running} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }} />
        <div className="prompt-footer">
          <span>{running ? 'AI 正在安全副本中工作' : turns.length > 0 ? `已保留 ${turns.length} 轮上下文` : 'Enter 发送 · Shift+Enter 换行'}</span>
          {running ? <button type="button" className="cancel-agent" aria-label="停止本次修改" onClick={onCancel}><Square size={14} /></button> : <button type="button" aria-label="发送消息" onClick={submit} disabled={!message.trim() || !workspace}><ArrowUp size={18} /></button>}
        </div>
      </div>
    </section>
  )
}

function TurnView({ turn, candidate, running, showReview, onToggleReview, onReject, onPermission }: { turn: ConversationTurn; candidate?: CandidateSnapshot; running: boolean; showReview: boolean; onToggleReview(): void; onReject(id: string): void; onPermission(requestId: string, optionId: string): void }): React.JSX.Element {
  const activity = turn.activity
  const terminal = turn.terminal
  return (
    <article className="conversation-turn">
      <div className="message student-message">{turn.started.message}</div>
      {turn.plan && <div className="plan-strip" aria-label="本次修改计划">{turn.plan.steps.map((step, index) => {
        const completed = terminal?.type === 'completed' || (activity ? (['editing', 'validating'].includes(activity.state) && index === 0) || (activity.state === 'validating' && index === 1) : false)
        const active = !completed && ((activity?.state === 'thinking' && index === 0) || (activity?.state === 'editing' && index === 1) || (activity?.state === 'validating' && index === 2))
        return <span key={step.id} className={completed ? 'done' : active ? 'active' : ''}><i>{completed ? '✓' : index + 1}</i>{step.label}</span>
      })}</div>}
      {(turn.assistantText || activity || terminal || turn.permission) && <div className="message assistant-message">
        <span className="assistant-mark"><Bot size={16} /></span>
        <div className="assistant-copy">
          {turn.assistantText && <div className="assistant-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}>{turn.assistantText}</ReactMarkdown></div>}
          {turn.permission && <div className="permission-card" role="group" aria-label="AI 需要你的选择"><span className="permission-icon"><ShieldCheck size={17} /></span><div><strong>{turn.permission.title}</strong><p>{turn.permission.detail}</p></div><div className="permission-actions">{turn.permission.options.map((option) => <button type="button" key={option.id} className={option.tone === 'approve' ? 'approve' : option.tone === 'reject' ? 'reject' : ''} onClick={() => onPermission(turn.permission!.requestId, option.id)}>{option.label}</button>)}</div></div>}
          {running && activity && <span className="agent-activity"><LoaderCircle size={13} className="spin" /> {activity.label}</span>}
          {terminal?.type === 'failed' && <ProblemCard problem={toStudentProblem(terminal.message, '这次没有完成')} tone="danger" compact />}
          {terminal?.type === 'cancelled' && <div className="agent-cancelled"><Square size={12} /> {terminal.message}</div>}
          {candidate && ['review_ready', 'build_passed'].includes(candidate.state) && <div className="change-card"><span className="change-status"><CheckCircle2 size={15} /> {candidate.state === 'build_passed' ? '代码检查通过' : '已通过安全核对'}</span><strong>这次修改</strong><small>{turn.summary ?? '修改只保存在安全草稿中。'}</small>{showReview && candidate.validation && <div className="review-summary"><span><FileCheck2 size={13} /> {candidate.validation.changedFiles} 个允许文件</span>{candidate.validation.files.map((file) => <code key={file.path}>{file.path} · +{file.additions} / -{file.deletions}</code>)}</div>}<div className="change-actions"><button type="button" onClick={onToggleReview}>{showReview ? '收起摘要' : '查看安全摘要'}</button><button type="button" onClick={() => onReject(candidate.id)}>放弃修改</button><button type="button" className="button-primary" disabled>{candidate.state === 'build_passed' ? '可在右侧保存到项目' : '请在右侧检查代码'}</button></div></div>}
          {terminal?.type === 'completed' && terminal.state === 'no_changes' && <div className="agent-cancelled"><CheckCircle2 size={13} /> {terminal.message}</div>}
        </div>
      </div>}
    </article>
  )
}

export function buildConversation(events: AgentEvent[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  const byId = new Map<string, ConversationTurn>()
  const resolved = new Set(events.filter((event): event is Extract<AgentEvent, { type: 'permission_resolved' }> => event.type === 'permission_resolved').map((event) => event.requestId))
  for (const event of events) {
    if (event.type === 'turn_started') {
      const turn: ConversationTurn = { turnId: event.turnId, started: event, assistantText: '' }
      turns.push(turn); byId.set(event.turnId, turn); continue
    }
    const turn = byId.get(event.turnId)
    if (!turn) continue
    if (event.type === 'assistant_delta') turn.assistantText += event.text
    else if (event.type === 'plan') turn.plan = event
    else if (event.type === 'activity') turn.activity = event
    else if (event.type === 'permission_request' && !resolved.has(event.requestId)) turn.permission = event
    else if (event.type === 'permission_resolved' && turn.permission?.requestId === event.requestId) turn.permission = undefined
    else if (event.type === 'candidate_ready') turn.summary = event.summary
    else if (event.type === 'completed' || event.type === 'cancelled' || event.type === 'failed') turn.terminal = event
  }
  return turns
}
