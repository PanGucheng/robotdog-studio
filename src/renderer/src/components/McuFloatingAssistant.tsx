import { ArrowLeft, Bot, Grip, MoveDiagonal2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentEvent, CandidateSnapshot, WorkspaceSummary } from '../../../shared/types'
import type { AppEditionProfile } from '../../../shared/edition'
import { getRobotApi } from '../lib/browser-demo-api'
import {
  clampFloatingPoint,
  isPointerDrag,
  moveFloatingWindowGeometry,
  resizeFloatingWindowGeometry,
  resolveFloatingPoint,
  restoreFloatingPlacement,
  restoreFloatingWindowGeometry,
  snapFloatingPlacement,
  viewportDeltaToLocal,
  type FloatingAiPlacement,
  type FloatingWindowGeometry,
  type FloatingWindowResizeCorner,
  type Point,
  type Rect
} from '../lib/mcu-workspace-model'
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
  const [windowGeometry, setWindowGeometry] = useState<FloatingWindowGeometry | undefined>(initial.windowGeometry)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const pointRef = useRef<Point>({ x: 0, y: 0 })
  const windowGeometryRef = useRef<FloatingWindowGeometry | undefined>(initial.windowGeometry)
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point; scale: Point; dragged: boolean } | undefined>(undefined)
  const windowInteractionRef = useRef<{ pointerId: number; kind: 'move' | 'resize'; corner?: FloatingWindowResizeCorner; start: Point; origin: FloatingWindowGeometry; scale: Point } | undefined>(undefined)
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

  const updateWindowGeometry = (next: FloatingWindowGeometry): void => {
    windowGeometryRef.current = next
    setWindowGeometry((current) => current && sameWindowGeometry(current, next) ? current : next)
  }

  useLayoutEffect(() => {
    const geometry = workspaceGeometry()
    const update = (): void => {
      const rect = workspaceGeometry().rect
      updatePoint(resolveFloatingPoint(placement, rect))
      updateWindowGeometry(restoreFloatingWindowGeometry(windowGeometryRef.current, rect))
    }
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
    if (!windowGeometry) return
    localStorage.setItem(storageKey, JSON.stringify({ version: 2, open, placement, windowGeometry }))
  }, [storageKey, open, placement, windowGeometry])

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

  const startWindowInteraction = (kind: 'move' | 'resize', event: ReactPointerEvent<HTMLElement>, corner?: FloatingWindowResizeCorner): void => {
    if (event.button !== 0 || !windowGeometryRef.current) return
    if (kind === 'move' && (event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    windowInteractionRef.current = {
      pointerId: event.pointerId,
      kind,
      corner,
      start: { x: event.clientX, y: event.clientY },
      origin: windowGeometryRef.current,
      scale: workspaceGeometry().scale
    }
  }

  const moveWindowInteraction = (event: ReactPointerEvent<HTMLElement>): void => {
    const interaction = windowInteractionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    event.preventDefault()
    const delta = viewportDeltaToLocal(interaction.start, { x: event.clientX, y: event.clientY }, interaction.scale)
    const rect = workspaceGeometry().rect
    updateWindowGeometry(interaction.kind === 'move'
      ? moveFloatingWindowGeometry(interaction.origin, delta, rect)
      : resizeFloatingWindowGeometry(interaction.origin, delta, rect, interaction.corner))
  }

  const endWindowInteraction = (event: ReactPointerEvent<HTMLElement>): void => {
    const interaction = windowInteractionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    windowInteractionRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const cancelWindowInteraction = (event: ReactPointerEvent<HTMLElement>): void => {
    const interaction = windowInteractionRef.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    windowInteractionRef.current = undefined
    updateWindowGeometry(restoreFloatingWindowGeometry(interaction.origin, workspaceGeometry().rect))
  }

  const keyboardWindowDelta = (kind: 'move' | 'resize', event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.currentTarget !== event.target || !windowGeometryRef.current) return
    const distance = event.shiftKey ? 32 : 12
    const delta = event.key === 'ArrowLeft' ? { x: -distance, y: 0 }
      : event.key === 'ArrowRight' ? { x: distance, y: 0 }
        : event.key === 'ArrowUp' ? { x: 0, y: -distance }
          : event.key === 'ArrowDown' ? { x: 0, y: distance }
            : undefined
    if (!delta) return
    event.preventDefault()
    const rect = workspaceGeometry().rect
    updateWindowGeometry(kind === 'move'
      ? moveFloatingWindowGeometry(windowGeometryRef.current, delta, rect)
      : resizeFloatingWindowGeometry(windowGeometryRef.current, delta, rect, 'south-east'))
  }

  return <div className={`mcu-floating-assistant edge-${placement.edge}`}>
    <button ref={buttonRef} type="button" className="mcu-ai-button" style={{ transform: `translate(${point.x}px, ${point.y}px)` }} aria-label={`${open ? '收起' : '打开'} AI 助教${unread.workspace || unread.lecture ? '，有新回答' : ''}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel}><Bot size={22} />{(unread.workspace || unread.lecture) && <i />}</button>
    {open && windowGeometry && <section className="mcu-ai-window" style={{ left: windowGeometry.x, top: windowGeometry.y, width: windowGeometry.width, height: windowGeometry.height }} role="dialog" aria-label="AI 助教" onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }}>
      <header tabIndex={0} aria-label="移动 AI 助教窗口，可使用方向键" onKeyDown={(event) => keyboardWindowDelta('move', event)} onPointerDown={(event) => startWindowInteraction('move', event)} onPointerMove={moveWindowInteraction} onPointerUp={endWindowInteraction} onPointerCancel={cancelWindowInteraction}><span><Grip size={15} /><strong>AI 助教</strong><small>{domain === 'workspace' ? '实验 AI' : '课程知识问答'}</small></span><div>{domain === 'lecture' && <button type="button" onClick={() => setDomain('workspace')}><ArrowLeft size={14} />返回实验 AI</button>}<button type="button" onClick={() => { setOpen(false); buttonRef.current?.focus() }} aria-label="收起 AI 助教"><X size={16} /></button></div></header>
      <div className="mcu-ai-domain" hidden={domain !== 'workspace'}><ChatPanel workspace={props.workspace} edition={props.edition} events={props.events} candidate={props.candidate} running={props.running} onPrompt={props.onPrompt} onCancel={props.onCancel} onReject={props.onReject} onPermission={props.onPermission} compact onOpenSettings={props.onOpenSettings} draftRequest={draftRequest} /></div>
      <div className="mcu-ai-domain" hidden={domain !== 'lecture'}><LectureHistory events={lectureEvents} /></div>
      <span className="mcu-ai-resize-zone corner-north-west" aria-hidden="true" onPointerDown={(event) => startWindowInteraction('resize', event, 'north-west')} onPointerMove={moveWindowInteraction} onPointerUp={endWindowInteraction} onPointerCancel={cancelWindowInteraction} />
      <span className="mcu-ai-resize-zone corner-north-east" aria-hidden="true" onPointerDown={(event) => startWindowInteraction('resize', event, 'north-east')} onPointerMove={moveWindowInteraction} onPointerUp={endWindowInteraction} onPointerCancel={cancelWindowInteraction} />
      <span className="mcu-ai-resize-zone corner-south-west" aria-hidden="true" onPointerDown={(event) => startWindowInteraction('resize', event, 'south-west')} onPointerMove={moveWindowInteraction} onPointerUp={endWindowInteraction} onPointerCancel={cancelWindowInteraction} />
      <button type="button" className="mcu-ai-resize-handle corner-south-east" aria-label="调整 AI 助教窗口大小，可使用方向键" title="拖动调整窗口大小" onKeyDown={(event) => keyboardWindowDelta('resize', event)} onPointerDown={(event) => startWindowInteraction('resize', event, 'south-east')} onPointerMove={moveWindowInteraction} onPointerUp={endWindowInteraction} onPointerCancel={cancelWindowInteraction}><MoveDiagonal2 size={13} /></button>
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
function readPreference(key: string): { open: boolean; placement: FloatingAiPlacement; windowGeometry?: FloatingWindowGeometry } {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as { version?: unknown; open?: unknown; placement?: unknown; windowGeometry?: unknown } | null
    if ((value?.version === 1 || value?.version === 2) && typeof value.open === 'boolean') {
      return { open: value.open, placement: restoreFloatingPlacement(value.placement), ...(value.version === 2 && isStoredWindowGeometry(value.windowGeometry) ? { windowGeometry: value.windowGeometry } : {}) }
    }
  } catch { /* fall through */ }
  return { open: false, placement: { edge: 'right', yRatio: 1 } }
}

function isStoredWindowGeometry(value: unknown): value is FloatingWindowGeometry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const geometry = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every((key) => typeof geometry[key] === 'number' && Number.isFinite(geometry[key]))
}

function sameWindowGeometry(left: FloatingWindowGeometry, right: FloatingWindowGeometry): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
}
