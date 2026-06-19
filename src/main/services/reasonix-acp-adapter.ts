import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterEvent, AdapterTurnContext, ReasonixAdapter } from './reasonix-adapter'
import { ReasonixPermissionPolicy } from './reasonix-permission-policy'
import { ReasonixProcessManager } from './reasonix-process-manager'

interface UpdateParams { update?: { sessionUpdate?: string; content?: { text?: string }; title?: string; kind?: string; status?: string } }
interface PermissionParams {
  toolCall?: { toolCallId?: string; title?: string; kind?: string; rawInput?: Record<string, unknown> }
  options?: Array<{ optionId?: string; name?: string; kind?: string }>
}
interface PendingPermission { turnId: string; allowed: Set<string>; resolve: (optionId: string) => void }

export class ReasonixAcpAdapter implements ReasonixAdapter {
  readonly kind = 'reasonix' as const
  private readonly pendingPermissions = new Map<string, PendingPermission>()

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
    process.client.handleRequest('session/request_permission', async (value) => {
      const params = (value ?? {}) as PermissionParams
      const requestId = params.toolCall?.toolCallId ?? ''
      const isQuestion = requestId.startsWith('ask-')
      const safeEdit = policy.decide(value).outcome.outcome === 'selected'
      if (!requestId || (!isQuestion && !safeEdit)) return { outcome: { outcome: 'cancelled' } }
      const options = (params.options ?? []).flatMap((option) => {
        if (!option.optionId || !option.name) return []
        const reject = option.kind === 'reject_once' || option.kind === 'reject_always' || option.optionId.endsWith(':cancel')
        if (!isQuestion && option.kind !== 'allow_once' && !reject) return []
        return [{ id: option.optionId, label: isQuestion ? option.name : reject ? '暂不允许' : '允许这次修改', tone: reject ? 'reject' as const : isQuestion ? 'neutral' as const : 'approve' as const }]
      }).slice(0, 6)
      if (options.length === 0) return { outcome: { outcome: 'cancelled' } }
      const detail = isQuestion ? 'Reasonix 需要你的选择后才能继续。' : permissionDetail(params.toolCall?.rawInput)
      emit({ type: 'permission_request', sequence: ++sequence, requestId, title: params.toolCall?.title ?? (isQuestion ? '需要你的选择' : '允许修改学生文件？'), kind: isQuestion ? 'question' : 'edit', detail, options })
      const optionId = await this.waitForPermission(context.turnId, requestId, options.map((option) => option.id), signal)
      return optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } }
    })
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
      this.cancelPermissionsForTurn(context.turnId)
      dispose()
      await process.stop()
      await writeFile(configPath, originalConfig, 'utf8').catch(() => undefined)
    }
  }

  respondPermission(turnId: string, requestId: string, optionId: string): boolean {
    const pending = this.pendingPermissions.get(requestId)
    if (!pending || pending.turnId !== turnId || !pending.allowed.has(optionId)) return false
    this.pendingPermissions.delete(requestId)
    pending.resolve(optionId)
    return true
  }

  private waitForPermission(turnId: string, requestId: string, options: string[], signal: AbortSignal): Promise<string> {
    return new Promise((resolve) => {
      const finish = (optionId: string): void => {
        clearTimeout(timer)
        signal.removeEventListener('abort', cancel)
        resolve(optionId)
      }
      const cancel = (): void => {
        this.pendingPermissions.delete(requestId)
        finish('')
      }
      const timer = setTimeout(cancel, 5 * 60_000)
      this.pendingPermissions.set(requestId, { turnId, allowed: new Set(options), resolve: finish })
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
  }

  private cancelPermissionsForTurn(turnId: string): void {
    for (const [requestId, pending] of this.pendingPermissions) {
      if (pending.turnId !== turnId) continue
      this.pendingPermissions.delete(requestId)
      pending.resolve('')
    }
  }
}

function permissionDetail(input?: Record<string, unknown>): string {
  const paths = Object.entries(input ?? {}).filter(([key, value]) => /path|file/i.test(key) && typeof value === 'string').map(([, value]) => String(value))
  return paths.length > 0 ? `将只在安全副本中修改：${paths.slice(0, 3).join('、')}` : '将只在安全副本和允许的学生文件范围内修改。'
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
