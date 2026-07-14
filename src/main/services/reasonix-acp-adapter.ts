import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterEvent, AdapterTurnContext, ReasonixAdapter } from './reasonix-adapter'
import { ReasonixPermissionPolicy } from './reasonix-permission-policy'
import { ReasonixProcessManager, type ReasonixRuntimeProfile } from './reasonix-process-manager'
import { buildStudentAgentPrompt } from './student-agent-prompt'

interface UpdateParams {
  update?: {
    sessionUpdate?: string
    content?: { text?: string }
    title?: string
    kind?: string
    status?: string
    entries?: Array<{ id?: string; title?: string; content?: string; status?: string }>
    steps?: Array<{ id?: string; title?: string; content?: string; status?: string }>
  }
}
interface PermissionParams {
  toolCall?: {
    toolCallId?: string
    title?: string
    kind?: string
    rawInput?: Record<string, unknown>
    locations?: Array<{ path?: string; line?: number }>
  }
  options?: Array<{ optionId?: string; name?: string; kind?: string }>
}
interface PendingPermission { turnId: string; allowed: Set<string>; resolve: (optionId: string) => void }
type PermissionResponse = { outcome: { outcome: 'selected' | 'cancelled'; optionId?: string } }

export function automaticPermissionResponse(candidateRoot: string, value: unknown): PermissionResponse | undefined {
  const params = (value ?? {}) as PermissionParams
  const requestId = params.toolCall?.toolCallId ?? ''
  if (requestId.startsWith('ask-')) return undefined
  if (!requestId) return { outcome: { outcome: 'cancelled' } }
  const policy = new ReasonixPermissionPolicy(candidateRoot)
  return policy.assess(value).allowed ? policy.decide(value) : { outcome: { outcome: 'cancelled' } }
}

export class ReasonixAcpAdapter implements ReasonixAdapter {
  readonly kind = 'reasonix' as const
  private readonly pendingPermissions = new Map<string, PendingPermission>()
  private readonly sessions = new Map<string, string>()

  constructor(private readonly processes: ReasonixProcessManager, private readonly getApiKey: () => Promise<string>) {}

  async runTurn(context: AdapterTurnContext, emit: (event: AdapterEvent | unknown) => void, signal: AbortSignal): Promise<{ summary: string }> {
    const apiKey = await this.getApiKey()
    if (!apiKey) throw new Error('REASONIX_API_KEY_MISSING')
    const configPath = join(context.candidateRoot, 'reasonix.toml')
    const originalConfig = await readFile(configPath, 'utf8').catch(() => '')
    await writeFile(configPath, secureConfig, 'utf8')
    const runtimeProfile = selectReasonixProfile(context)
    const process = await this.processes.start(context.candidateRoot, apiKey, context.workspaceId, runtimeProfile)
    let sessionId = ''
    let sequence = 0
    let summary = ''
    process.client.handleRequest('session/request_permission', async (value) => {
      const params = (value ?? {}) as PermissionParams
      const requestId = params.toolCall?.toolCallId ?? ''
      if (context.readOnly) return { outcome: { outcome: 'cancelled' } }
      const automatic = automaticPermissionResponse(context.candidateRoot, value)
      if (automatic) return automatic
      const options = (params.options ?? []).flatMap((option) => {
        if (!option.optionId || !option.name) return []
        const reject = option.kind === 'reject_once' || option.kind === 'reject_always' || option.optionId.endsWith(':cancel')
        return [{ id: option.optionId, label: option.name, tone: reject ? 'reject' as const : 'neutral' as const }]
      }).slice(0, 6)
      if (options.length === 0) return { outcome: { outcome: 'cancelled' } }
      emit({ type: 'permission_request', sequence: ++sequence, requestId, title: params.toolCall?.title ?? '需要你的选择', kind: 'question', detail: '这个选择会影响修改结果，请选一个更符合你想法的答案。', options })
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
      } else if (update.sessionUpdate === 'plan') {
        const rawSteps = update.steps ?? update.entries ?? []
        const steps = rawSteps.flatMap((step, index) => {
          const label = studentPlanLabel(step.title ?? step.content ?? '')
          return label ? [{ id: step.id ?? `reasonix-plan-${index + 1}`, label }] : []
        }).slice(0, 6)
        if (steps.length) emit({ type: 'plan', sequence: ++sequence, steps })
      }
    })
    const cancel = (): void => { if (sessionId) process.client.notify('session/cancel', { sessionId }) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      await process.client.request('initialize', { protocolVersion: 1, clientInfo: { name: 'robotdog-studio', title: 'RobotDog Studio', version: '0.1.0' } })
      sessionId = await this.openWorkspaceSession(process.client, context.workspaceId, context.candidateRoot)
      if (signal.aborted) throw signal.reason
      emit({ type: 'activity', sequence: ++sequence, label: context.readOnly ? 'Reasonix 正在用中文解释错误' : 'Reasonix 已连接，正在修改候选副本', state: context.readOnly ? 'thinking' : 'editing' })
      const result = await process.client.request<{ stopReason: string }>('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: context.readOnly ? context.message : buildStudentAgentPrompt(context.message, { policyVersion: context.policyVersion }) }]
      }, 10 * 60_000)
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

  private async openWorkspaceSession(client: import('./acp-client').AcpClient, workspaceId: string, cwd: string): Promise<string> {
    let sessionId = this.sessions.get(workspaceId)
    if (!sessionId) {
      const listed = await client.request<{ sessions?: Array<{ sessionId?: string; updatedAt?: string }> }>('session/list', {}).catch(() => ({ sessions: [] }))
      sessionId = listed.sessions?.filter((session) => typeof session.sessionId === 'string').sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).at(0)?.sessionId
    }
    if (sessionId) {
      const resumed = await client.request('session/resume', { sessionId, cwd, mcpServers: [] }).then(() => true, () => false)
      if (resumed) { this.sessions.set(workspaceId, sessionId); return sessionId }
    }
    const created = await client.request<{ sessionId: string }>('session/new', { cwd, mcpServers: [] })
    this.sessions.set(workspaceId, created.sessionId)
    return created.sessionId
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

export function selectReasonixProfile(context: Pick<AdapterTurnContext, 'readOnly' | 'taskKind'>): ReasonixRuntimeProfile {
  if (context.taskKind === 'repair_compile_error' || context.taskKind === 'teacher_diagnostic') return 'delivery'
  if (context.taskKind === 'explain_code' || context.taskKind === 'explain_diagnostic') return 'economy'
  if (context.readOnly) return 'economy'
  return 'balanced'
}

function studentPlanLabel(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  return compact.length > 48 ? `${compact.slice(0, 47)}…` : compact
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
