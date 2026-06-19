import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentEvent } from '../../shared/types'
import { AgentSessionService } from './agent-session-service'
import { CandidateService } from './candidate-service'
import { MockReasonixAdapter } from './mock-reasonix-adapter'
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
    expect((await candidates.get(turn.candidateId)).state).toBe('review_ready')
    expect(await readFile(join(dataRoot, 'workspaces', workspaceId, 'project', 'student-config', 'line-following.yaml'), 'utf8')).toContain('turn_strength: 18')
  })

  it('cancels a running turn and removes its candidate worktree', async () => {
    const service = new AgentSessionService(candidates, new MockReasonixAdapter({ stepDelayMs: 100 }))
    const events: AgentEvent[] = []
    service.on('event', (event) => events.push(event))
    const turn = await service.prompt(workspaceId, '调整转弯')
    expect(await service.cancel(turn.turnId)).toBe(true)

    expect(events.at(-1)).toMatchObject({ type: 'cancelled' })
    expect((await candidates.get(turn.candidateId)).state).toBe('cancelled')
    expect((await workspaces.get(workspaceId)).state).toBe('ready')
  })

  it('converts a simulated adapter crash into a student-safe failure', async () => {
    const service = new AgentSessionService(candidates, new MockReasonixAdapter({ stepDelayMs: 0, failAtStep: 3 }))
    const events: AgentEvent[] = []
    service.on('event', (event) => events.push(event))
    const turn = await service.prompt(workspaceId, '调整转弯')
    await waitUntilIdle(service)

    expect(events.at(-1)).toMatchObject({ type: 'failed', code: 'AGENT_CRASHED' })
    expect((await candidates.get(turn.candidateId)).state).toBe('cancelled')
    expect((await workspaces.get(workspaceId)).state).toBe('ready')
  })

  it('cleans up a no-change turn so the workspace remains available', async () => {
    const service = new AgentSessionService(candidates, new MockReasonixAdapter({ stepDelayMs: 0 }))
    const events: AgentEvent[] = []
    service.on('event', (event) => events.push(event))
    const turn = await service.prompt(workspaceId, '只检查一下，不用修改')
    await waitUntilIdle(service)

    expect(events.at(-1)).toMatchObject({ type: 'completed', state: 'no_changes' })
    expect((await candidates.get(turn.candidateId)).state).toBe('rejected')
    expect((await workspaces.get(workspaceId)).state).toBe('ready')
  })
})

async function waitUntilIdle(service: AgentSessionService): Promise<void> {
  const deadline = Date.now() + 10_000
  while (service.getActive()) {
    if (Date.now() > deadline) throw new Error('agent test timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
