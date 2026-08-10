import { ArrowLeft, Bot, Grip, MoveHorizontal, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentEvent, CandidateSnapshot, WorkspaceSummary } from '../../../shared/types'
import type { AppEditionProfile } from '../../../shared/edition'
import { getRobotApi } from '../lib/browser-demo-api'
import { clampFloatingPoint, isPointerDrag, resolveFloatingPoint, restoreFloatingPlacement, snapFloatingPlacement, viewportDeltaToLocal, type FloatingAiPlacement, type Point, type Rect } from '../lib/mcu-workspace-model'
import { ChatPanel } from './ChatPanel'

export type FloatingAssistantIntent =
  | { kind: 'workspace-open'; draft?: string; nonce: number }
  | { kind: 'workspace-step'; draft: string; nonce: number }
  | { kind: 'workspace-explanation'; nonce: number }
  | { kind: 'lecture-answer'; nonce: number }

interface McuFloatingAssistantProps {
  workspace: WorkspaceSummary
  edition: AppEditionProfile
  events: AgentEvent[]
  candidate?: CandidateSnapshot
  running: boolean
  intent?: FloatingAssistantIntent
  onPrompt(message: string): void
  onCancel(): void
  onReject(candidateId: string): void
  onPermission(requestId: string, optionId: string): void
  onOpenSettings?(): void
}

export function McuFloatingAssistant(props: McuFloatingAssistantProps): React.JSX.Element {
  const storageKey = `robotdog.mcu.ai.v1.${props.workspace.id}`
  const initial = useMemo(() => readPreference(storageKey), [storageKey])
  const [open, setOpen] = useState(initial.open)
  const [placement, setPlacement] = useState<FloatingAiPlacement>(initial.placement)
  const [domain, setDomain] = useState<'workspace' | 'lecture'>('workspace')
  const [lectureEvents, setLectureEvents] = useState<AgentEvent[]>([])
  const [unread, setUnread] = useState({ workspace: false, lecture: false })
  const [draftRequest, setDraftRequest] = useState<{ text: string; nonce: number }>()
  const [point, setPoint] = useState<Point>({ x: 0, y: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const pointRef = useRef<Point>({ x: 0, y: 0 })
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point; scale: Point; dragged: boolean } | undefined>(undefined)
  const previousTerminalCount = useRef(terminalCount(props.events))

  const workspaceGeometry = (): { element?: HTMLElement; rect: Rect; scale: Point } => {
    const element = buttonRef.current?.closest<HTMLElement>('.mcu-workbench-shell')
    if (!element) return { rect: { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }, scale: { x: 1, y: 1 } }
    const viewport = element.getBoundingClientRect()
    const width = element.clientWidth
    const height = element.clientHeight
    return {
      element,
      rect: { left: 0, top: 0, width, height },
      scale: {
        x: width > 0 && viewport.width > 0 ? viewport.width / width : 1,
        y: height > 0 && viewport.height > 0 ? viewport.height / height : 1
      }
    }
  }

  const updatePoint = (next: Point): void => {
    pointRef.current = next
    setPoint(next)
  }

  useLayoutEffect(() => {
    const geometry = workspaceGeometry()
    const update = (): void => updatePoint(resolveFloatingPoint(placement, workspaceGeometry().rect))
    update()
    const observer = geometry.element && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : undefined
    if (geometry.element) observer?.observe(geometry.element)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [placement.edge, placement.yRatio])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, open, placement }))
  }, [storageKey, open, placement])

  useEffect(() => {
    if (!props.intent) return
    setOpen(true)
    if (props.intent.kind === 'lecture-answer') {
      setDomain('lecture')
      setUnread((current) => ({ ...current, lecture: false }))
      void loadLectureHistory(props.workspace).then(setLectureEvents)
    } else {
      setDomain('workspace')
      setUnread((current) => ({ ...current, workspace: false }))
      if ('draft' in props.intent && props.intent.draft) setDraftRequest({ text: props.intent.draft, nonce: props.intent.nonce })
    }
  }, [props.intent?.nonce])

  useEffect(() => {
    const next = terminalCount(props.events)
    if (next > previousTerminalCount.current && !open) setUnread((current) => ({ ...current, workspace: true }))
    previousTerminalCount.current = next
  }, [props.events, open])

  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: pointRef.current, scale: workspaceGeometry().scale, dragged: false }
  }

  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const current = { x: event.clientX, y: event.clientY }
    if (!drag.dragged) drag.dragged = isPointerDrag(drag.start, current)
    if (!drag.dragged) return
    event.preventDefault()
    const delta = viewportDeltaToLocal(drag.start, current, drag.scale)
    updatePoint(clampFloatingPoint({ x: drag.origin.x + delta.x, y: drag.origin.y + delta.y }, workspaceGeometry().rect))
  }

  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag.dragged) setPlacement(snapFloatingPlacement(pointRef.current, workspaceGeometry().rect))
    else { setDomain('workspace'); setOpen((value) => !value); setUnread((current) => ({ ...current, workspace: false })) }
  }

  const pointerCancel = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = undefined
    updatePoint(resolveFloatingPoint(placement, workspaceGeometry().rect))
  }

  return <div className={`mcu-floating-assistant edge-${placement.edge}`}>
    <button ref={buttonRef} type="button" className="mcu-ai-button" style={{ transform: `translate(${point.x}px, ${point.y}px)` }} aria-label={`${open ? '收起' : '打开'} AI 助教${unread.workspace || unread.lecture ? '，有新回答' : ''}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel}><Bot size={22} />{(unread.workspace || unread.lecture) && <i />}</button>
    {open && <section className="mcu-ai-window" role="dialog" aria-label="AI 助教" onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }}>
      <header><span><Grip size={15} /><strong>AI 助教</strong><small>{domain === 'workspace' ? '实验 AI' : '课程知识问答'}</small></span><div>{domain === 'lecture' && <button type="button" onClick={() => setDomain('workspace')}><ArrowLeft size={14} />返回实验 AI</button>}<button type="button" onClick={() => setPlacement((current) => ({ ...current, edge: current.edge === 'left' ? 'right' : 'left' }))} aria-label="移动到另一侧"><MoveHorizontal size={15} /></button><button type="button" onClick={() => { setOpen(false); buttonRef.current?.focus() }} aria-label="收起 AI 助教"><X size={16} /></button></div></header>
      <div className="mcu-ai-domain" hidden={domain !== 'workspace'}><ChatPanel workspace={props.workspace} edition={props.edition} events={props.events} candidate={props.candidate} running={props.running} onPrompt={props.onPrompt} onCancel={props.onCancel} onReject={props.onReject} onPermission={props.onPermission} compact onOpenSettings={props.onOpenSettings} draftRequest={draftRequest} /></div>
      <div className="mcu-ai-domain" hidden={domain !== 'lecture'}><LectureHistory events={lectureEvents} /></div>
    </section>}
  </div>
}

function LectureHistory({ events }: { events: AgentEvent[] }): React.JSX.Element {
  const messages = groupLectureEvents(events)
  return <div className="mcu-lecture-chat" aria-live="polite">{messages.length ? messages.map((message) => <article key={message.id}><div className="message student-message">{message.question}</div><div className="message assistant-message"><span className="assistant-mark"><Bot size={16} /></span><div className="assistant-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{message.answer || '正在整理讲义回答…'}</ReactMarkdown></div></div></article>) : <div className="chat-welcome"><span className="assistant-mark"><Bot size={16} /></span><div><strong>还没有课程知识问答</strong><p>在 Lab Guide 的讲义中选择一段内容后提问，回答会保存在课程与课次版本下。</p></div></div>}</div>
}

function groupLectureEvents(events: AgentEvent[]): Array<{ id: string; question: string; answer: string }> {
  const rows: Array<{ id: string; question: string; answer: string }> = []
  const byId = new Map<string, { id: string; question: string; answer: string }>()
  for (const event of events) {
    if (event.type === 'turn_started') { const row = { id: event.turnId, question: event.message, answer: '' }; rows.push(row); byId.set(event.turnId, row) }
    else if (event.type === 'assistant_delta') { const row = byId.get(event.turnId); if (row) row.answer += event.text }
  }
  return rows
}

async function loadLectureHistory(workspace: WorkspaceSummary): Promise<AgentEvent[]> {
  const binding = workspace.courseBinding
  return binding ? getRobotApi().listCourseLectureHistory(binding.courseId, binding.lessonId) : []
}

function terminalCount(events: AgentEvent[]): number { return events.filter((event) => event.type === 'completed' || event.type === 'cancelled' || event.type === 'failed').length }
function readPreference(key: string): { open: boolean; placement: FloatingAiPlacement } {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as { version?: unknown; open?: unknown; placement?: unknown } | null
    if (value?.version === 1 && typeof value.open === 'boolean') return { open: value.open, placement: restoreFloatingPlacement(value.placement) }
  } catch { /* fall through */ }
  return { open: false, placement: { edge: 'right', yRatio: 1 } }
}
