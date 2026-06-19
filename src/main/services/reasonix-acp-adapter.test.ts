import { describe, expect, it } from 'vitest'
import { ReasonixAcpAdapter } from './reasonix-acp-adapter'

describe('ReasonixAcpAdapter workspace sessions', () => {
  it('creates once, then resumes the same session in a new candidate cwd', async () => {
    const calls: Array<{ method: string; params: unknown }> = []
    const client = {
      request: async (method: string, params: unknown): Promise<unknown> => {
        calls.push({ method, params })
        if (method === 'session/list') return { sessions: [] }
        if (method === 'session/new') return { sessionId: 'session-1' }
        if (method === 'session/resume') return {}
        throw new Error(`unexpected ${method}`)
      }
    }
    const adapter = new ReasonixAcpAdapter({} as never, async () => 'unused')
    const open = (adapter as unknown as { openWorkspaceSession(client: unknown, workspaceId: string, cwd: string): Promise<string> }).openWorkspaceSession.bind(adapter)

    await expect(open(client, 'ws_111111111111111111111111', 'C:\\candidate-1')).resolves.toBe('session-1')
    await expect(open(client, 'ws_111111111111111111111111', 'C:\\candidate-2')).resolves.toBe('session-1')

    expect(calls.map((call) => call.method)).toEqual(['session/list', 'session/new', 'session/resume'])
    expect(calls.at(-1)?.params).toMatchObject({ sessionId: 'session-1', cwd: 'C:\\candidate-2' })
  })

  it('recovers the latest persisted session after an app restart', async () => {
    const calls: string[] = []
    const client = { request: async (method: string): Promise<unknown> => {
      calls.push(method)
      if (method === 'session/list') return { sessions: [{ sessionId: 'persisted-session' }] }
      if (method === 'session/resume') return {}
      throw new Error(`unexpected ${method}`)
    } }
    const adapter = new ReasonixAcpAdapter({} as never, async () => 'unused')
    const open = (adapter as unknown as { openWorkspaceSession(client: unknown, workspaceId: string, cwd: string): Promise<string> }).openWorkspaceSession.bind(adapter)

    await expect(open(client, 'ws_222222222222222222222222', 'C:\\candidate')).resolves.toBe('persisted-session')
    expect(calls).toEqual(['session/list', 'session/resume'])
  })
})
