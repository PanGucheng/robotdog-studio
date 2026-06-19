import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../../../shared/types'
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
})

function event(turnId: string, sequence: number, payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, eventId: `${turnId}:${sequence}`, turnId, sequence, timestamp: new Date(0).toISOString() }
}
