import type { AgentEvent } from './types'

const DEFAULT_MAX_TURNS = 100

/**
 * Keeps complete conversation turns while collapsing token-sized stream events.
 * A single model response can contain thousands of deltas, so trimming by raw
 * event count would discard the turn_started event and make the whole turn
 * invisible to the renderer.
 */
export function compactAgentEvents(events: AgentEvent[], maxTurns = DEFAULT_MAX_TURNS): AgentEvent[] {
  const startedTurnIds = events
    .filter((event) => event.type === 'turn_started')
    .map((event) => event.turnId)
  const retained = new Set(startedTurnIds.slice(-maxTurns))
  const byTurn = new Map<string, AgentEvent[]>()

  for (const event of events) {
    if (!retained.has(event.turnId)) continue
    const turn = byTurn.get(event.turnId) ?? []
    turn.push(event)
    byTurn.set(event.turnId, turn)
  }

  return startedTurnIds.slice(-maxTurns).flatMap((turnId) => compactTurn(byTurn.get(turnId) ?? []))
}

function compactTurn(events: AgentEvent[]): AgentEvent[] {
  const fixed: AgentEvent[] = []
  let assistantText = ''
  let assistantEvent: Extract<AgentEvent, { type: 'assistant_delta' }> | undefined
  let plan: Extract<AgentEvent, { type: 'plan' }> | undefined
  let activity: Extract<AgentEvent, { type: 'activity' }> | undefined
  let candidate: Extract<AgentEvent, { type: 'candidate_ready' }> | undefined
  let terminal: Extract<AgentEvent, { type: 'completed' | 'cancelled' | 'failed' }> | undefined

  for (const event of events) {
    if (event.type === 'assistant_delta') {
      assistantText += event.text
      assistantEvent = event
    } else if (event.type === 'plan') plan = event
    else if (event.type === 'activity') activity = event
    else if (event.type === 'candidate_ready') candidate = event
    else if (event.type === 'completed' || event.type === 'cancelled' || event.type === 'failed') terminal = event
    else fixed.push(event)
  }

  if (plan) fixed.push(plan)
  if (assistantEvent) fixed.push({ ...assistantEvent, text: assistantText })
  if (activity) fixed.push(activity)
  if (candidate) fixed.push(candidate)
  if (terminal) fixed.push(terminal)
  return fixed.sort((a, b) => a.sequence - b.sequence)
}
