import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentEvent } from '../../shared/types'
import { AgentSessionService } from './agent-session-service'
import { CandidateService } from './candidate-service'
import { MockReasonixAdapter } from './mock-reasonix-adapter'
import type { AdapterEvent, AdapterTurnContext, ReasonixAdapter } from './reasonix-adapter'
import { WorkspaceService } from './workspace-service'

describe('AgentSessionService', () => {
  let sandbox: string
  let dataRoot: string
  let workspaces: WorkspaceService
  let candidates: CandidateService
  let workspaceId: string

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'robotdog-agent-'))
    dataRoot = join(sandbox, 'data')
    const templateRoot = join(sandbox, 'template')
    await mkdir(join(templateRoot, 'Core', 'Src'), { recursive: true })
    await mkdir(join(templateRoot, 'Core', 'Inc'), { recursive: true })
    await mkdir(join(templateRoot, 'student-config'), { recursive: true })
    await writeFile(join(templateRoot, 'Core', 'Src', 'student_control.c'), 'void StudentControl_Update(void) {}\n')
    await writeFile(join(templateRoot, 'Core', 'Inc', 'student_control.h'), 'void StudentControl_Update(void);\n')
    await writeFile(join(templateRoot, 'student-config', 'line-following.yaml'), 'turn_strength: 18\nline_target: 64\n')
    workspaces = new WorkspaceService({ rootDir: dataRoot, templateRoot })
    workspaceId = (await workspaces.create({ name: 'AI 训练', studentDisplayName: '周同学' })).id
    candidates = new CandidateService({ rootDir: dataRoot, workspaces })
    await candidates.initialize()
  })

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  it('streams a safe mock turn and ignores duplicate or unknown events', async () => {
    const service = new AgentSessionService(candidates, new MockReasonixAdapter({ stepDelayMs: 0, emitDuplicateAndUnknown: true }))
    const events: AgentEvent[] = []
    service.on('event', (event) => events.push(event))
    const turn = await service.prompt(workspaceId, '小马转弯太猛了，温柔一点')
    await waitUntilIdle(service)

    expect(events.map((event) => event.type)).toEqual([
      'turn_started', 'plan', 'activity', 'assistant_delta', 'activity', 'assistant_delta', 'activity', 'candidate_ready', 'completed'
    ])
    expect(new Set(events.map((event) => event.eventId)).size).toBe(events.length)
    expect(events.map((event) => event.sequence)).toEqual(events.map((_event, index) => index + 1))
    expect(events[0]).toMatchObject({ type: 'turn_started', promptVersion: 'robotdog-student-v1.0.0' })
    expect(turn.promptHash).toMatch(/^[a-f0-9]{64}$/)
    expect((await candidates.get(turn.candidateId!)).state).toBe('review_ready')
    expect(events.find((event) => event.type === 'candidate_ready')).toMatchObject({ summary: '已准备好巡线参数的修改。请在右侧看看改动，再决定是否保存。' })
    expect(await readFile(join(dataRoot, 'workspaces', workspaceId, 'project', 'student-config', 'line-following.yaml'), 'utf8')).toContain('turn_strength: 18')
  })

  it('cancels a running turn and removes its candidate worktree', async () => {
    const service = new AgentSessionService(candidates, new MockReasonixAdapter({ stepDelayMs: 100 }))
    const events: AgentEvent[] = []
    service.on('event', (event) => events.push(event))
    const turn = await service.prompt(workspaceId, '调整转弯')
    expect(await service.cancel(turn.turnId)).toBe(true)

    expect(events.at(-1)).toMatchObject({ type: 'cancelled' })
    expect((await candidates.get(turn.candidateId!)).state).toBe('cancelled')
    expect((await workspaces.get(workspaceId)).state).toBe('ready')
  })

  it('converts a simulated adapter crash into a student-safe failure', async () => {
    const service = new AgentSessionService(candidates, new MockReasonixAdapter({ stepDelayMs: 0, failAtStep: 3 }))
    const events: AgentEvent[] = []
    service.on('event', (event) => events.push(event))
    const turn = await service.prompt(workspaceId, '调整转弯')
    await waitUntilIdle(service)

    expect(events.at(-1)).toMatchObject({ type: 'failed', code: 'AGENT_CRASHED' })
    expect((await candidates.get(turn.candidateId!)).state).toBe('cancelled')
    expect((await workspaces.get(workspaceId)).state).toBe('ready')
  })

  it('cleans up a no-change turn so the workspace remains available', async () => {
    const service = new AgentSessionService(candidates, new MockReasonixAdapter({ stepDelayMs: 0 }))
    const events: AgentEvent[] = []
    service.on('event', (event) => events.push(event))
    const turn = await service.prompt(workspaceId, '只检查一下，不用修改')
    await waitUntilIdle(service)

    expect(events.at(-1)).toMatchObject({ type: 'completed', state: 'no_changes' })
    expect((await candidates.get(turn.candidateId!)).state).toBe('rejected')
    expect((await workspaces.get(workspaceId)).state).toBe('ready')
  })

  it('explains a manual draft error without modifying or closing the draft', async () => {
    const draft = await candidates.openManualDraft(workspaceId)
    const before = (await candidates.listStudentCodeFiles(workspaceId, draft.id)).map((file) => file.content)
    const service = new AgentSessionService(candidates, new MockReasonixAdapter({ stepDelayMs: 0 }))
    const events: AgentEvent[] = []
    service.on('event', (event) => events.push(event))

    await service.explainStudentCode(workspaceId, { kind: 'diagnostic', candidateId: draft.id, content: 'student_control.c:8: error: expected ;' })
    await waitUntilIdle(service)

    expect(events).toContainEqual(expect.objectContaining({ type: 'turn_started', message: '请解释刚才的编译错误' }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'assistant_delta' }))
    expect(events.at(-1)).toMatchObject({ type: 'completed', state: 'no_changes' })
    expect((await candidates.get(draft.id)).state).toBe('agent_running')
    expect((await candidates.listStudentCodeFiles(workspaceId, draft.id)).map((file) => file.content)).toEqual(before)
  })

  it('explains selected code from the read-only project without opening a draft', async () => {
    const service = new AgentSessionService(candidates, new MockReasonixAdapter({ stepDelayMs: 0 }))
    const events: AgentEvent[] = []
    service.on('event', (event) => events.push(event))

    const turn = await service.explainStudentCode(workspaceId, {
      kind: 'selection', selectedPath: 'Core/Src/student_control.c', content: 'void StudentControl_Update(void) {}'
    })
    await waitUntilIdle(service)

    expect(turn.candidateId).toBeUndefined()
    expect(events[0]).toMatchObject({ type: 'turn_started', message: '请解释我选中的代码', candidateId: undefined })
    expect(events).toContainEqual(expect.objectContaining({ type: 'assistant_delta', text: expect.stringContaining('小马') }))
    expect(events.at(-1)).toMatchObject({ type: 'completed', message: '代码讲解完成，项目没有被 AI 修改。' })
    expect((await workspaces.get(workspaceId)).state).toBe('ready')
    expect((await workspaces.get(workspaceId)).activeCandidateId).toBeUndefined()
  })

  it('pauses for a visible permission and resumes only after the matching response', async () => {
    const adapter = new PermissionFixtureAdapter()
    const service = new AgentSessionService(candidates, adapter)
    const events: AgentEvent[] = []
    service.on('event', (event) => events.push(event))
    const turn = await service.prompt(workspaceId, '把转弯强度降低 2')
    await waitForEvent(events, 'permission_request')

    expect(events.find((event) => event.type === 'permission_request')).toMatchObject({
      title: '确认这一步吗？', detail: '同意后只会继续处理这次安全草稿。'
    })

    expect(service.respondPermission('wrong-turn', 'write-1', 'allow_once')).toBe(false)
    expect(service.respondPermission(turn.turnId, 'write-1', 'allow_once')).toBe(true)
    await waitUntilIdle(service)

    expect(events.map((event) => event.type)).toContain('permission_resolved')
    expect((await candidates.get(turn.candidateId!)).state).toBe('review_ready')
  })
})

class PermissionFixtureAdapter implements ReasonixAdapter {
  readonly kind = 'reasonix' as const
  private pending?: { turnId: string; resolve: () => void }

  async runTurn(context: AdapterTurnContext, emit: (event: AdapterEvent | unknown) => void): Promise<{ summary: string }> {
    emit({ type: 'permission_request', sequence: 1, requestId: 'write-1', title: '允许修改？', kind: 'edit', detail: '安全副本', options: [{ id: 'allow_once', label: '允许', tone: 'approve' }] })
    await new Promise<void>((resolve) => { this.pending = { turnId: context.turnId, resolve } })
    await writeFile(join(context.candidateRoot, 'student-config', 'line-following.yaml'), 'turn_strength: 16\nline_target: 64\n')
    return { summary: '已修改。' }
  }

  respondPermission(turnId: string, requestId: string, optionId: string): boolean {
    if (!this.pending || this.pending.turnId !== turnId || requestId !== 'write-1' || optionId !== 'allow_once') return false
    this.pending.resolve()
    this.pending = undefined
    return true
  }
}

async function waitUntilIdle(service: AgentSessionService): Promise<void> {
  const deadline = Date.now() + 10_000
  while (service.getActive()) {
    if (Date.now() > deadline) throw new Error('agent test timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function waitForEvent(events: AgentEvent[], type: AgentEvent['type']): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!events.some((event) => event.type === type)) {
    if (Date.now() > deadline) throw new Error('agent event timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
