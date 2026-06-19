import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterEvent, AdapterTurnContext, ReasonixAdapter } from './reasonix-adapter'
import { ReasonixPermissionPolicy } from './reasonix-permission-policy'
import { ReasonixProcessManager } from './reasonix-process-manager'

interface UpdateParams { update?: { sessionUpdate?: string; content?: { text?: string }; title?: string; kind?: string; status?: string } }

export class ReasonixAcpAdapter implements ReasonixAdapter {
  readonly kind = 'reasonix' as const

  constructor(private readonly processes: ReasonixProcessManager, private readonly getApiKey: () => Promise<string>) {}

  async runTurn(context: AdapterTurnContext, emit: (event: AdapterEvent | unknown) => void, signal: AbortSignal): Promise<{ summary: string }> {
    const apiKey = await this.getApiKey()
    if (!apiKey) throw new Error('REASONIX_API_KEY_MISSING')
    const configPath = join(context.candidateRoot, 'reasonix.toml')
    const originalConfig = await readFile(configPath, 'utf8').catch(() => '')
    await writeFile(configPath, secureConfig, 'utf8')
    const process = await this.processes.start(context.candidateRoot, apiKey)
    let sessionId = ''
    let sequence = 0
    let summary = ''
    const policy = new ReasonixPermissionPolicy(context.candidateRoot)
    process.client.handleRequest('session/request_permission', (params) => policy.decide(params))
    const dispose = process.client.onNotification((method, params) => {
      if (method !== 'session/update') return
      const update = (params as UpdateParams).update
      if (!update) return
      if (update.sessionUpdate === 'agent_message_chunk' && update.content?.text) {
        summary += update.content.text
        emit({ type: 'assistant_delta', sequence: ++sequence, text: update.content.text })
      } else if (update.sessionUpdate === 'agent_thought_chunk') {
        emit({ type: 'activity', sequence: ++sequence, label: 'Reasonix 正在分析项目', state: 'thinking' })
      } else if (update.sessionUpdate === 'tool_call') {
        emit({ type: 'activity', sequence: ++sequence, label: update.title ?? '正在处理文件', state: update.kind === 'edit' ? 'editing' : 'thinking' })
      }
    })
    const cancel = (): void => { if (sessionId) process.client.notify('session/cancel', { sessionId }) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      await process.client.request('initialize', { protocolVersion: 1, clientInfo: { name: 'robotdog-studio', title: 'RobotDog Studio', version: '0.1.0' } })
      const created = await process.client.request<{ sessionId: string }>('session/new', { cwd: context.candidateRoot, mcpServers: [] })
      sessionId = created.sessionId
      if (signal.aborted) throw signal.reason
      emit({ type: 'activity', sequence: ++sequence, label: 'Reasonix 已连接，正在修改候选副本', state: 'editing' })
      const result = await process.client.request<{ stopReason: string }>('session/prompt', { sessionId, prompt: [{ type: 'text', text: context.message }] }, 10 * 60_000)
      if (result.stopReason === 'error') throw new Error('AGENT_CRASHED')
      if (result.stopReason === 'cancelled' || signal.aborted) throw signal.reason ?? new Error('AGENT_CANCELLED')
      await process.client.request('session/close', { sessionId }).catch(() => undefined)
      return { summary: summary.slice(0, 4_000) || 'Reasonix 已完成候选修改。' }
    } finally {
      signal.removeEventListener('abort', cancel)
      dispose()
      await process.stop()
      await writeFile(configPath, originalConfig, 'utf8').catch(() => undefined)
    }
  }
}

const secureConfig = `default_model = "deepseek-flash"

[[providers]]
name = "deepseek-flash"
kind = "openai"
base_url = "https://api.deepseek.com"
model = "deepseek-chat"
api_key_env = "DEEPSEEK_API_KEY"

[tools]
enabled = ["read_file", "ls", "glob", "grep", "edit_file", "write_file"]

[sandbox]
workspace_root = "."
network = false
`
