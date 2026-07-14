import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { automaticPermissionResponse, ReasonixAcpAdapter, selectReasonixProfile } from './reasonix-acp-adapter'

describe('ReasonixAcpAdapter permission batching', () => {
  const root = join('C:', 'managed', 'candidate')
  const options = [{ optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' }]

  it('automatically allows whitelisted candidate edits without a UI round trip', () => {
    expect(automaticPermissionResponse(root, {
      toolCall: { toolCallId: 'edit-1', kind: 'edit', rawInput: { path: 'Core/Src/student_control.c' } }, options
    })).toEqual({ outcome: { outcome: 'selected', optionId: 'allow_once' } })
    expect(automaticPermissionResponse(root, {
      toolCall: { toolCallId: 'read-1', kind: 'read', rawInput: { path: 'README.md' } }, options
    })).toEqual({ outcome: { outcome: 'selected', optionId: 'allow_once' } })
  })

  it('automatically rejects unsafe tools while preserving real student questions', () => {
    expect(automaticPermissionResponse(root, {
      toolCall: { toolCallId: 'exec-1', kind: 'execute', rawInput: { command: 'git status' } }, options
    })).toEqual({ outcome: { outcome: 'cancelled' } })
    expect(automaticPermissionResponse(root, {
      toolCall: { toolCallId: 'ask-choice', kind: 'question' }, options
    })).toBeUndefined()
  })
})

describe('ReasonixAcpAdapter runtime profile selection', () => {
  it('keeps Reasonix profiles internal and chooses them from task intent', () => {
    expect(selectReasonixProfile({ taskKind: 'explain_code', readOnly: true })).toBe('economy')
    expect(selectReasonixProfile({ taskKind: 'explain_diagnostic', readOnly: true })).toBe('economy')
    expect(selectReasonixProfile({ taskKind: 'modify_code' })).toBe('balanced')
    expect(selectReasonixProfile({ taskKind: 'repair_compile_error' })).toBe('delivery')
    expect(selectReasonixProfile({ taskKind: 'teacher_diagnostic' })).toBe('delivery')
  })

  it('falls back safely for legacy read-only and edit turns', () => {
    expect(selectReasonixProfile({ readOnly: true })).toBe('economy')
    expect(selectReasonixProfile({})).toBe('balanced')
  })
})

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
