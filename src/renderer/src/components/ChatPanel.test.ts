import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../../../shared/types'
import { compactAgentEvents } from '../../../shared/agent-event-history'
import { buildConversation } from './ChatPanel'

describe('ChatPanel conversation grouping', () => {
  it('keeps separate visible user and markdown replies for every turn', () => {
    const events = [
      event('turn-a', 1, { type: 'turn_started', workspaceId: 'ws_111111111111111111111111', candidateId: 'candidate-a', message: '第一次' }),
      event('turn-a', 2, { type: 'assistant_delta', text: '**回答一**' }),
      event('turn-a', 3, { type: 'completed', state: 'no_changes', message: '完成' }),
      event('turn-b', 1, { type: 'turn_started', workspaceId: 'ws_111111111111111111111111', candidateId: 'candidate-b', message: '继续追问' }),
      event('turn-b', 2, { type: 'assistant_delta', text: '- 回答二' })
    ] as unknown as AgentEvent[]

    expect(buildConversation(events).map((turn) => ({ message: turn.started.message, text: turn.assistantText }))).toEqual([
      { message: '第一次', text: '**回答一**' },
      { message: '继续追问', text: '- 回答二' }
    ])
  })

  it('keeps a long streaming turn visible after compaction', () => {
    const events = [
      event('turn-long', 1, { type: 'turn_started', workspaceId: 'ws_111111111111111111111111', candidateId: 'candidate-a', message: '不要消失' }),
      ...Array.from({ length: 2_500 }, (_, index) => event('turn-long', index + 2, { type: 'assistant_delta', text: '好' }))
    ] as unknown as AgentEvent[]

    const turns = buildConversation(compactAgentEvents(events))
    expect(turns).toHaveLength(1)
    expect(turns[0].started.message).toBe('不要消失')
    expect(turns[0].assistantText).toBe('好'.repeat(2_500))
  })
})

function event(turnId: string, sequence: number, payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, eventId: `${turnId}:${sequence}`, turnId, sequence, timestamp: new Date(0).toISOString() }
}
