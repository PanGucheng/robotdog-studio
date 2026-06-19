import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentEvent } from '../../shared/types'
import { AgentHistoryService } from './agent-history-service'

describe('AgentHistoryService', () => {
  const roots: string[] = []
  afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

  it('persists visible turns per workspace, redacts keys, and omits transient permissions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-history-'))
    roots.push(root)
    const service = new AgentHistoryService(root)
    await service.initialize()
    const workspaceId = 'ws_111111111111111111111111'
    await service.append(event('turn-1', 1, { type: 'turn_started', workspaceId, candidateId: 'candidate-1', message: '使用 sk-secret123456 测试' }))
    await service.append(event('turn-1', 2, { type: 'permission_request', requestId: 'request-1', title: '允许？', kind: 'edit', detail: '文件', options: [] }))
    await service.append(event('turn-1', 3, { type: 'assistant_delta', text: '**完成**' }))

    const history = await service.list(workspaceId)
    expect(history.map((item) => item.type)).toEqual(['turn_started', 'assistant_delta'])
    expect(JSON.stringify(history)).not.toContain('sk-secret123456')
    expect(await readFile(join(root, `${workspaceId}.jsonl`), 'utf8')).toContain('[REDACTED]')
  })
})

function event(turnId: string, sequence: number, payload: Record<string, unknown>): AgentEvent {
  return { ...payload, eventId: `${turnId}:${sequence}`, turnId, sequence, timestamp: new Date(0).toISOString() } as unknown as AgentEvent
}
