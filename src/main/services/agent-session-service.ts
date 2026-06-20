import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { AgentEvent, AgentEventPayload, AgentTurnSnapshot, CandidateSnapshot, StudentPlanStep } from '../../shared/types'
import { CandidateService } from './candidate-service'
import type { AdapterEvent, ReasonixAdapter } from './reasonix-adapter'
import { buildDiagnosticExplanationPrompt, STUDENT_AGENT_PROMPT_SHA256, STUDENT_AGENT_PROMPT_VERSION } from './student-agent-prompt'

const workspaceIdSchema = z.string().regex(/^ws_[a-f0-9]{24}$/)
const messageSchema = z.string().trim().min(1).max(2_000)

interface ActiveTurn {
  snapshot: AgentTurnSnapshot
  controller: AbortController
  done: Promise<void>
  lastAdapterSequence: number
  eventSequence: number
  readOnly?: boolean
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

  async explainManualDraft(workspaceId: string, candidateId: string, diagnostic: string): Promise<AgentTurnSnapshot> {
    const validWorkspaceId = workspaceIdSchema.parse(workspaceId)
    const candidate = await this.candidates.get(candidateId)
    if (candidate.workspaceId !== validWorkspaceId || candidate.origin !== 'manual') throw new Error('MANUAL_DRAFT_MISMATCH')
    if (this.active) throw new Error('AGENT_BUSY')
    const snippets = (await this.candidates.listStudentCodeFiles(validWorkspaceId, candidate.id))
      .filter((file) => file.editable).map((file) => ({ path: file.path, content: file.content.slice(0, 8_000) }))
    const turnId = `turn_${randomBytes(12).toString('hex')}`
    const snapshot: AgentTurnSnapshot = {
      turnId, workspaceId: validWorkspaceId, candidateId: candidate.id, state: 'preparing',
      message: buildDiagnosticExplanationPrompt(diagnostic.slice(0, 4_000), snippets),
      promptVersion: STUDENT_AGENT_PROMPT_VERSION, promptHash: STUDENT_AGENT_PROMPT_SHA256, startedAt: new Date().toISOString()
    }
    const active: ActiveTurn = { snapshot, controller: new AbortController(), done: Promise.resolve(), lastAdapterSequence: 0, eventSequence: 0, readOnly: true }
    this.active = active
    this.publish(active, { type: 'turn_started', workspaceId: validWorkspaceId, candidateId: candidate.id, message: '请解释刚才的编译错误', promptVersion: STUDENT_AGENT_PROMPT_VERSION, promptHash: STUDENT_AGENT_PROMPT_SHA256 })
    active.done = this.runExplanation(active).finally(() => { if (this.active?.snapshot.turnId === turnId) this.active = undefined })
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
      const candidateSnapshot = await this.candidates.get(snapshot.candidateId)
      const candidateRoot = await this.candidates.getCandidateRootForMain(snapshot.candidateId)
      const result = await this.adapter.runTurn({
        turnId: snapshot.turnId,
        workspaceId: snapshot.workspaceId,
        candidateId: snapshot.candidateId,
        candidateRoot,
        message: snapshot.message,
        policyVersion: candidateSnapshot.policyVersion
      }, (event) => this.receiveAdapterEvent(active, event), controller.signal)
      if (controller.signal.aborted) throw controller.signal.reason
      snapshot.state = 'validating'
      const candidate = await this.candidates.validate(snapshot.candidateId)
      if (candidate.state === 'review_ready' || candidate.state === 'no_changes') {
        snapshot.state = candidate.state
        this.publish(active, { type: 'candidate_ready', candidate, summary: result.summary })
        if (candidate.state === 'no_changes') await this.candidates.reject(candidate.id)
        this.publish(active, { type: 'completed', state: candidate.state, message: candidate.state === 'review_ready' ? '修改已通过安全核对，等你查看。' : '检查完成，没有需要应用的新修改。' })
      } else {
        snapshot.state = 'failed'
        await this.candidates.reject(candidate.id).catch(() => undefined)
        this.publish(active, { type: 'failed', code: 'PATCH_DENIED', message: candidate.error ?? '修改没有通过安全核对。' })
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        snapshot.state = 'cancelled'
        await this.safeCancelCandidate(snapshot.candidateId)
        this.publish(active, { type: 'cancelled', message: '已停止这次修改，正式项目没有变化。' })
      } else {
        snapshot.state = 'failed'
        await this.safeCancelCandidate(snapshot.candidateId)
        const code = caught instanceof Error && caught.message === 'AGENT_CRASHED' ? 'AGENT_CRASHED' : 'AGENT_FAILED'
        this.publish(active, { type: 'failed', code, message: 'AI 助教暂时没有完成这次修改，你可以重新试一次。' })
      }
    }
  }

  private async runExplanation(active: ActiveTurn): Promise<void> {
    const { snapshot, controller } = active
    try {
      const candidate = await this.candidates.get(snapshot.candidateId)
      const candidateRoot = await this.candidates.getCandidateRootForMain(snapshot.candidateId)
      await this.adapter.runTurn({
        turnId: snapshot.turnId, workspaceId: snapshot.workspaceId, candidateId: snapshot.candidateId,
        candidateRoot, message: snapshot.message, policyVersion: candidate.policyVersion, readOnly: true
      }, (event) => this.receiveAdapterEvent(active, event), controller.signal)
      if (controller.signal.aborted) throw controller.signal.reason
      snapshot.state = 'no_changes'
      this.publish(active, { type: 'completed', state: 'no_changes', message: '错误解释完成，安全草稿没有被 AI 修改。' })
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
      type: 'permission_request', requestId: event.requestId, title: event.title.slice(0, 160), kind: event.kind,
      detail: event.detail.slice(0, 500), options: event.options.slice(0, 6).map((option) => ({ ...option, label: option.label.slice(0, 100) }))
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
