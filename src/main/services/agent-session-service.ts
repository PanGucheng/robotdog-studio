import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { AgentEvent, AgentEventPayload, AgentTurnSnapshot, CandidateSnapshot, StudentCodeExplanationRequest, StudentPlanStep } from '../../shared/types'
import { CandidateService, type ManualRepairBackup } from './candidate-service'
import type { AdapterEvent, ReasonixAdapter } from './reasonix-adapter'
import { buildStudentCodeExplanationPrompt, STUDENT_AGENT_PROMPT_SHA256, STUDENT_AGENT_PROMPT_VERSION } from './student-agent-prompt'

const workspaceIdSchema = z.string().regex(/^ws_[a-f0-9]{24}$/)
const messageSchema = z.string().trim().min(1).max(2_000)
const explanationRequestSchema = z.object({
  kind: z.enum(['selection', 'diagnostic']),
  candidateId: z.string().regex(/^cand_[a-f0-9]{24}$/).optional(),
  selectedPath: z.enum(['Core/Src/student_control.c', 'Core/Inc/student_control.h', 'student-config/line-following.yaml']).optional(),
  content: z.string().trim().min(1).max(4_000)
}).strict()

interface ActiveTurn {
  snapshot: AgentTurnSnapshot
  controller: AbortController
  done: Promise<void>
  lastAdapterSequence: number
  eventSequence: number
  readOnly?: boolean
  explanation?: { root: string; policyVersion: string; kind: StudentCodeExplanationRequest['kind'] }
  agentMessage?: string
  repair?: boolean
  repairBackup?: ManualRepairBackup
}

export class AgentSessionService extends EventEmitter {
  private active?: ActiveTurn

  constructor(private readonly candidates: CandidateService, private readonly adapter: ReasonixAdapter) {
    super()
  }

  async prompt(workspaceId: string, message: string): Promise<AgentTurnSnapshot> {
    const validWorkspaceId = workspaceIdSchema.parse(workspaceId)
    const validMessage = messageSchema.parse(message)
    if (this.active) throw new Error('AGENT_BUSY')
    const candidate = await this.candidates.create(validWorkspaceId)
    const turnId = `turn_${randomBytes(12).toString('hex')}`
    const snapshot: AgentTurnSnapshot = {
      turnId,
      workspaceId: validWorkspaceId,
      candidateId: candidate.id,
      state: 'preparing',
      message: validMessage,
      promptVersion: STUDENT_AGENT_PROMPT_VERSION,
      promptHash: STUDENT_AGENT_PROMPT_SHA256,
      startedAt: new Date().toISOString()
    }
    const active: ActiveTurn = { snapshot, controller: new AbortController(), done: Promise.resolve(), lastAdapterSequence: 0, eventSequence: 0 }
    this.active = active
    this.publish(active, {
      type: 'turn_started', workspaceId: validWorkspaceId, candidateId: candidate.id, message: validMessage,
      promptVersion: STUDENT_AGENT_PROMPT_VERSION, promptHash: STUDENT_AGENT_PROMPT_SHA256
    })
    active.done = this.run(active).finally(() => {
      if (this.active?.snapshot.turnId === turnId) this.active = undefined
    })
    return structuredClone(snapshot)
  }

  async explainStudentCode(workspaceId: string, input: unknown): Promise<AgentTurnSnapshot> {
    const validWorkspaceId = workspaceIdSchema.parse(workspaceId)
    const request = explanationRequestSchema.parse(input)
    if (request.kind === 'selection' && !request.selectedPath) throw new Error('STUDENT_EXPLAIN_PATH_REQUIRED')
    if (this.active) throw new Error('AGENT_BUSY')
    const context = await this.candidates.getStudentCodeContextForMain(validWorkspaceId, request.candidateId)
    const snippets = context.files
      .filter((file) => request.kind === 'selection' ? file.path === request.selectedPath : file.editable)
      .map((file) => ({ path: file.path, content: file.content.slice(0, 8_000) }))
    const turnId = `turn_${randomBytes(12).toString('hex')}`
    const snapshot: AgentTurnSnapshot = {
      turnId, workspaceId: validWorkspaceId, candidateId: request.candidateId, state: 'preparing',
      message: buildStudentCodeExplanationPrompt(request.kind, request.content, snippets),
      promptVersion: STUDENT_AGENT_PROMPT_VERSION, promptHash: STUDENT_AGENT_PROMPT_SHA256, startedAt: new Date().toISOString()
    }
    const active: ActiveTurn = {
      snapshot, controller: new AbortController(), done: Promise.resolve(), lastAdapterSequence: 0, eventSequence: 0, readOnly: true,
      explanation: { root: context.root, policyVersion: context.policyVersion, kind: request.kind }
    }
    this.active = active
    this.publish(active, {
      type: 'turn_started', workspaceId: validWorkspaceId, candidateId: request.candidateId,
      message: request.kind === 'selection' ? '请解释我选中的代码' : '请解释刚才的编译错误',
      promptVersion: STUDENT_AGENT_PROMPT_VERSION, promptHash: STUDENT_AGENT_PROMPT_SHA256
    })
    active.done = this.runExplanation(active).finally(() => { if (this.active?.snapshot.turnId === turnId) this.active = undefined })
    return structuredClone(snapshot)
  }

  async repairStudentCode(workspaceId: string, candidateId: string): Promise<AgentTurnSnapshot> {
    const validWorkspaceId = workspaceIdSchema.parse(workspaceId)
    const candidate = await this.candidates.get(candidateId)
    if (candidate.workspaceId !== validWorkspaceId || candidate.origin !== 'manual') throw new Error('MANUAL_DRAFT_MISMATCH')
    if (!candidate.diagnostics?.length) throw new Error('STUDENT_REPAIR_DIAGNOSTIC_MISSING')
    if (this.active) throw new Error('AGENT_BUSY')
    const turnId = `turn_${randomBytes(12).toString('hex')}`
    const displayMessage = '接受 AI 建议，修复这次编译错误'
    const snapshot: AgentTurnSnapshot = {
      turnId, workspaceId: validWorkspaceId, candidateId: candidate.id, state: 'preparing', message: displayMessage,
      promptVersion: STUDENT_AGENT_PROMPT_VERSION, promptHash: STUDENT_AGENT_PROMPT_SHA256, startedAt: new Date().toISOString()
    }
    const repairBackup = await this.candidates.createManualRepairBackupForMain(candidate.id)
    const active: ActiveTurn = {
      snapshot, controller: new AbortController(), done: Promise.resolve(), lastAdapterSequence: 0, eventSequence: 0,
      agentMessage: buildDiagnosticRepairMessage(candidate.diagnostics), repair: true, repairBackup
    }
    await this.candidates.prepareManualRepair(candidate.id)
    this.active = active
    this.publish(active, {
      type: 'turn_started', workspaceId: validWorkspaceId, candidateId: candidate.id, message: displayMessage,
      promptVersion: STUDENT_AGENT_PROMPT_VERSION, promptHash: STUDENT_AGENT_PROMPT_SHA256
    })
    active.done = this.run(active).finally(() => { if (this.active?.snapshot.turnId === turnId) this.active = undefined })
    return structuredClone(snapshot)
  }

  async cancel(turnId?: string): Promise<boolean> {
    const active = this.active
    if (!active || (turnId && active.snapshot.turnId !== turnId)) return false
    active.controller.abort(new Error('AGENT_CANCELLED'))
    await active.done
    return true
  }

  getActive(): AgentTurnSnapshot | undefined {
    return this.active ? structuredClone(this.active.snapshot) : undefined
  }

  respondPermission(turnId: string, requestId: string, optionId: string): boolean {
    const active = this.active
    if (!active || active.snapshot.turnId !== turnId || !this.adapter.respondPermission?.(turnId, requestId, optionId)) return false
    this.publish(active, { type: 'permission_resolved', requestId, optionId })
    return true
  }

  private async run(active: ActiveTurn): Promise<void> {
    const { snapshot, controller } = active
    try {
      const candidateId = requireCandidateId(snapshot)
      const candidateSnapshot = await this.candidates.get(candidateId)
      const candidateRoot = await this.candidates.getCandidateRootForMain(candidateId)
      await this.adapter.runTurn({
        turnId: snapshot.turnId,
        workspaceId: snapshot.workspaceId,
        candidateId,
        candidateRoot,
        message: active.agentMessage ?? snapshot.message,
        policyVersion: candidateSnapshot.policyVersion
      }, (event) => this.receiveAdapterEvent(active, event), controller.signal)
      if (controller.signal.aborted) throw controller.signal.reason
      snapshot.state = 'validating'
      let candidate = await this.candidates.validate(candidateId)
      if (active.repair && candidate.state === 'review_ready') candidate = await this.candidates.build(candidate.id)
      if (candidate.state === 'review_ready' || candidate.state === 'build_passed' || candidate.state === 'no_changes') {
        snapshot.state = candidate.state === 'build_passed' ? 'review_ready' : candidate.state
        this.publish(active, { type: 'candidate_ready', candidate, summary: buildStudentCandidateSummary(candidate) })
        if (candidate.state === 'no_changes') await this.candidates.reject(candidate.id)
        const completedState = candidate.state === 'build_passed' ? 'review_ready' : candidate.state
        const message = candidate.state === 'build_passed' ? 'AI 已按建议修复，代码也通过了编译。请查看修改后再保存。'
          : candidate.state === 'review_ready' && active.repair && candidate.error ? 'AI 已尝试修复，但编译还发现问题。草稿已保留，可以继续查看。'
            : candidate.state === 'review_ready' ? '修改已通过安全核对，等你查看。' : '检查完成，没有需要应用的新修改。'
        this.publish(active, { type: 'completed', state: completedState, message })
      } else {
        snapshot.state = 'failed'
        if (active.repairBackup) await this.candidates.restoreManualRepairForMain(active.repairBackup).catch(() => undefined)
        else await this.candidates.reject(candidate.id).catch(() => undefined)
        this.publish(active, { type: 'failed', code: 'PATCH_DENIED', message: active.repair ? 'AI 建议超出了学生代码的安全范围，已经恢复原来的草稿。' : candidate.error ?? '修改没有通过安全核对。' })
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        snapshot.state = 'cancelled'
        if (active.repairBackup) await this.candidates.restoreManualRepairForMain(active.repairBackup).catch(() => undefined)
        else await this.safeCancelCandidate(requireCandidateId(snapshot))
        this.publish(active, { type: 'cancelled', message: active.repair ? '已停止自动修复，安全草稿仍然保留。' : '已停止这次修改，正式项目没有变化。' })
      } else {
        snapshot.state = 'failed'
        if (active.repairBackup) await this.candidates.restoreManualRepairForMain(active.repairBackup).catch(() => undefined)
        else await this.safeCancelCandidate(requireCandidateId(snapshot))
        const code = caught instanceof Error && caught.message === 'AGENT_CRASHED' ? 'AGENT_CRASHED' : 'AGENT_FAILED'
        this.publish(active, { type: 'failed', code, message: active.repair ? 'AI 助教暂时没有完成自动修复，安全草稿仍然保留。' : 'AI 助教暂时没有完成这次修改，你可以重新试一次。' })
      }
    }
  }

  private async runExplanation(active: ActiveTurn): Promise<void> {
    const { snapshot, controller } = active
    try {
      const explanation = active.explanation
      if (!explanation) throw new Error('STUDENT_EXPLANATION_CONTEXT_MISSING')
      await this.adapter.runTurn({
        turnId: snapshot.turnId, workspaceId: snapshot.workspaceId, candidateId: snapshot.candidateId ?? `readonly_${snapshot.workspaceId}`,
        candidateRoot: explanation.root, message: snapshot.message, policyVersion: explanation.policyVersion, readOnly: true
      }, (event) => this.receiveAdapterEvent(active, event), controller.signal)
      if (controller.signal.aborted) throw controller.signal.reason
      snapshot.state = 'no_changes'
      this.publish(active, {
        type: 'completed', state: 'no_changes',
        message: explanation.kind === 'selection' ? '代码讲解完成，项目没有被 AI 修改。' : '错误解释完成，安全草稿没有被 AI 修改。'
      })
    } catch {
      if (controller.signal.aborted) {
        snapshot.state = 'cancelled'
        this.publish(active, { type: 'cancelled', message: '已停止解释，安全草稿没有变化。' })
      } else {
        snapshot.state = 'failed'
        this.publish(active, { type: 'failed', code: 'DIAGNOSTIC_EXPLANATION_FAILED', message: 'AI 暂时没能解释这条错误，原始诊断仍保留在代码页。' })
      }
    }
  }

  private receiveAdapterEvent(active: ActiveTurn, event: unknown): void {
    if (!isAdapterEvent(event) || event.sequence <= active.lastAdapterSequence) return
    active.lastAdapterSequence = event.sequence
    if (event.type === 'plan') {
      const steps: StudentPlanStep[] = event.steps.slice(0, 6).map((step, index) => ({ ...step, status: index === 0 ? 'active' : 'pending' }))
      this.publish(active, { type: 'plan', steps })
    } else if (event.type === 'assistant_delta') this.publish(active, { type: 'assistant_delta', text: event.text.slice(0, 8_000) })
    else if (event.type === 'permission_request') this.publish(active, {
      type: 'permission_request', requestId: event.requestId,
      title: event.kind === 'question' ? 'AI 助教需要你选一种做法' : '确认这一步吗？', kind: event.kind,
      detail: event.kind === 'question' ? '选一个最符合你想法的答案，AI 助教再继续。' : '同意后只会继续处理这次安全草稿。',
      options: event.options.slice(0, 6).map((option) => ({ ...option, label: studentOptionLabel(option.label) }))
    })
    else {
      active.snapshot.state = event.state
      this.publish(active, { type: 'activity', label: event.label.slice(0, 120), state: event.state })
    }
  }

  private publish(active: ActiveTurn, event: AgentEventPayload): void {
    active.eventSequence += 1
    const payload = {
      ...event,
      eventId: `${active.snapshot.turnId}:${active.eventSequence}`,
      turnId: active.snapshot.turnId,
      sequence: active.eventSequence,
      timestamp: new Date().toISOString()
    } as AgentEvent
    this.emit('event', structuredClone(payload))
  }

  private async safeCancelCandidate(candidateId: string): Promise<void> {
    const candidate: CandidateSnapshot = await this.candidates.get(candidateId)
    if (['preparing', 'agent_running', 'validating', 'review_ready', 'building', 'build_passed', 'awaiting_apply'].includes(candidate.state)) {
      await this.candidates.cancel(candidateId).catch(() => undefined)
    }
  }
}

function isAdapterEvent(value: unknown): value is AdapterEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<AdapterEvent>
  if (!Number.isInteger(event.sequence) || (event.sequence ?? 0) < 1) return false
  if (event.type === 'assistant_delta') return typeof event.text === 'string'
  if (event.type === 'activity') return typeof event.label === 'string' && ['thinking', 'editing', 'validating'].includes(event.state ?? '')
  if (event.type === 'permission_request') return typeof event.requestId === 'string' && typeof event.title === 'string' && typeof event.detail === 'string' && ['edit', 'question'].includes(event.kind ?? '') && Array.isArray(event.options)
  if (event.type === 'plan') return Array.isArray(event.steps) && event.steps.every((step) => step && typeof step.id === 'string' && typeof step.label === 'string')
  return false
}

function requireCandidateId(snapshot: AgentTurnSnapshot): string {
  if (!snapshot.candidateId) throw new Error('CANDIDATE_ID_MISSING')
  return snapshot.candidateId
}

function buildStudentCandidateSummary(candidate: CandidateSnapshot): string {
  if (candidate.state === 'build_passed') return 'AI 建议已经写入安全草稿，并通过了编译。请查看改动后再保存。'
  const files = candidate.validation?.files ?? []
  if (files.length === 0) return '没有发现需要保存的代码变化。'
  const labels = files.slice(0, 3).map((file) => {
    if (file.path.endsWith('line-following.yaml')) return '巡线参数'
    if (file.path.endsWith('student_control.c')) return '小马控制代码'
    if (file.path.endsWith('student_control.h')) return '输入和动作说明'
    return '学生代码'
  })
  const uniqueLabels = [...new Set(labels)]
  return `已准备好${uniqueLabels.join('、')}的修改。请在右侧看看改动，再决定是否保存。`
}

function buildDiagnosticRepairMessage(diagnostics: NonNullable<CandidateSnapshot['diagnostics']>): string {
  return `请按照你刚才给学生的解释和建议，根据下面的编译诊断修复当前安全草稿。先读取对应学生文件，只做解决这些错误所需的最小修改，不要修改构建脚本、硬件配置、通信协议或其他文件。不要提问；完成后用适合小学生的中文简要说明改了什么。\n\n<compiler_diagnostics_json>\n${JSON.stringify(diagnostics)}\n</compiler_diagnostics_json>`
}

function studentOptionLabel(label: string): string {
  const compact = label.replace(/\s+/g, ' ').trim()
  return compact.length > 36 ? `${compact.slice(0, 35)}…` : compact
}
