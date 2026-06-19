import { useMemo, useState } from 'react'
import { ArrowUp, Bot, CheckCircle2, FileCheck2, LoaderCircle, Sparkles, Square, X } from 'lucide-react'
import type { AgentEvent, CandidateSnapshot, WorkspaceSummary } from '../../../shared/types'

interface ChatPanelProps {
  workspace?: WorkspaceSummary
  events: AgentEvent[]
  candidate?: CandidateSnapshot
  running: boolean
  onPrompt(message: string): void
  onCancel(): void
  onReject(candidateId: string): void
}

export function ChatPanel({ workspace, events, candidate, running, onPrompt, onCancel, onReject }: ChatPanelProps): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [showReview, setShowReview] = useState(false)
  const started = findLast(events, 'turn_started')
  const plan = findLast(events, 'plan')
  const activity = findLast(events, 'activity')
  const terminal = [...events].reverse().find((event) => ['completed', 'cancelled', 'failed'].includes(event.type))
  const assistantText = useMemo(() => events.filter((event): event is Extract<AgentEvent, { type: 'assistant_delta' }> => event.type === 'assistant_delta').map((event) => event.text).join(''), [events])

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
        <div>
          <span className="eyebrow">AI 助教</span>
          <h2>把想法说给小马听</h2>
        </div>
        <span className="model-chip"><Sparkles size={14} /> 模拟教学</span>
      </div>

      <div className="conversation" aria-live="polite">
        {!started && (
          <div className="chat-welcome">
            <span className="assistant-mark"><Bot size={16} /></span>
            <div><strong>先说一个你观察到的问题</strong><p>我会在安全副本里尝试修改，核对通过后再交给你查看。</p></div>
          </div>
        )}
        {started && <div className="message student-message">{started.message}</div>}
        {plan && (
          <div className="plan-strip" aria-label="本次修改计划">
            {plan.steps.map((step, index) => {
              const completed = terminal?.type === 'completed' || (activity ? ['editing', 'validating'].includes(activity.state) && index === 0 || activity.state === 'validating' && index === 1 : false)
              const active = !completed && (activity?.state === 'thinking' && index === 0 || activity?.state === 'editing' && index === 1 || activity?.state === 'validating' && index === 2)
              return <span key={step.id} className={completed ? 'done' : active ? 'active' : ''}><i>{completed ? '✓' : index + 1}</i>{step.label}</span>
            })}
          </div>
        )}
        {(assistantText || activity || terminal) && (
          <div className="message assistant-message">
            <span className="assistant-mark"><Bot size={16} /></span>
            <div className="assistant-copy">
              {assistantText && <p>{assistantText}</p>}
              {running && activity && <span className="agent-activity"><LoaderCircle size={13} className="spin" /> {activity.label}</span>}
              {terminal?.type === 'failed' && <div className="agent-error"><X size={14} /> <span><strong>这次没有完成</strong>{terminal.message} 正式项目没有变化。</span></div>}
              {terminal?.type === 'cancelled' && <div className="agent-cancelled"><Square size={12} /> {terminal.message}</div>}
              {candidate?.state === 'review_ready' && (
                <div className="change-card">
                  <span className="change-status"><CheckCircle2 size={15} /> 已通过安全核对</span>
                  <strong>转弯参数候选修改</strong>
                  <small>{findLast(events, 'candidate_ready')?.summary ?? '修改只保存在候选副本中。'}</small>
                  {showReview && candidate.validation && (
                    <div className="review-summary">
                      <span><FileCheck2 size={13} /> {candidate.validation.changedFiles} 个允许文件</span>
                      {candidate.validation.files.map((file) => <code key={file.path}>{file.path} · +{file.additions} / -{file.deletions}</code>)}
                    </div>
                  )}
                  <div className="change-actions">
                    <button type="button" onClick={() => setShowReview((value) => !value)}>{showReview ? '收起摘要' : '查看安全摘要'}</button>
                    <button type="button" onClick={() => onReject(candidate.id)}>放弃修改</button>
                    <button type="button" className="button-primary" disabled title="候选编译将在下一阶段接入">等待编译接入</button>
                  </div>
                </div>
              )}
              {terminal?.type === 'completed' && candidate?.state === 'no_changes' && <div className="agent-cancelled"><CheckCircle2 size={13} /> {terminal.message}</div>}
            </div>
          </div>
        )}
      </div>

      <div className="prompt-box">
        <textarea
          aria-label="告诉 AI 你希望机器马做什么"
          placeholder={workspace ? '例如：检测一下黑线，或者让转弯更平稳…' : '请先新建一个训练项目'}
          rows={3}
          value={message}
          disabled={!workspace || running}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() }
          }}
        />
        <div className="prompt-footer">
          <span>{running ? 'AI 正在安全副本中工作' : 'Enter 发送 · Shift+Enter 换行'}</span>
          {running
            ? <button type="button" className="cancel-agent" aria-label="停止本次修改" onClick={onCancel}><Square size={14} /></button>
            : <button type="button" aria-label="发送消息" onClick={submit} disabled={!message.trim() || !workspace}><ArrowUp size={18} /></button>}
        </div>
      </div>
    </section>
  )
}

function findLast<T extends AgentEvent['type']>(events: AgentEvent[], type: T): Extract<AgentEvent, { type: T }> | undefined {
  return [...events].reverse().find((event): event is Extract<AgentEvent, { type: T }> => event.type === type)
}
