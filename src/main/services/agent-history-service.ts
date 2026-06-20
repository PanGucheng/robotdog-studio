import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentEvent } from '../../shared/types'
import { compactAgentEvents } from '../../shared/agent-event-history'

const workspacePattern = /^ws_[a-f0-9]{24}$/
const persistedTypes = new Set<AgentEvent['type']>(['turn_started', 'plan', 'assistant_delta', 'activity', 'candidate_ready', 'completed', 'cancelled', 'failed'])

export class AgentHistoryService {
  private readonly turnWorkspaces = new Map<string, string>()
  private queue = Promise.resolve()

  constructor(private readonly rootDir: string) {}

  async initialize(): Promise<void> { await mkdir(this.rootDir, { recursive: true }) }

  append(event: AgentEvent): Promise<void> {
    if (event.type === 'turn_started') this.turnWorkspaces.set(event.turnId, event.workspaceId)
    const workspaceId = event.type === 'turn_started' ? event.workspaceId : this.turnWorkspaces.get(event.turnId)
    if (!workspaceId || !workspacePattern.test(workspaceId) || !persistedTypes.has(event.type)) return Promise.resolve()
    this.queue = this.queue.catch(() => undefined).then(async () => {
      const events = await this.list(workspaceId)
      if (!events.some((item) => item.eventId === event.eventId)) events.push(redactEvent(event))
      await this.write(workspaceId, compactAgentEvents(events))
    })
    return this.queue
  }

  async list(workspaceId: string): Promise<AgentEvent[]> {
    if (!workspacePattern.test(workspaceId)) throw new Error('WORKSPACE_ID_INVALID')
    const text = await readFile(this.pathFor(workspaceId), 'utf8').catch(() => '')
    const events = text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const value = JSON.parse(line) as AgentEvent
        return value && typeof value.eventId === 'string' && typeof value.turnId === 'string' && persistedTypes.has(value.type) ? [value] : []
      } catch { return [] }
    })
    const compacted = compactAgentEvents(events)
    for (const event of compacted) if (event.type === 'turn_started') this.turnWorkspaces.set(event.turnId, event.workspaceId)
    return compacted
  }

  private pathFor(workspaceId: string): string { return join(this.rootDir, `${workspaceId}.jsonl`) }

  private async write(workspaceId: string, events: AgentEvent[]): Promise<void> {
    const target = this.pathFor(workspaceId)
    const temporary = `${target}.tmp`
    const backup = `${target}.bak`
    await writeFile(temporary, `${events.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8')
    await copyFile(target, backup).catch(() => undefined)
    await rename(temporary, target).catch(async () => {
      await rm(target, { force: true })
      await rename(temporary, target)
    })
  }
}

function redactEvent<T extends AgentEvent>(event: T): T {
  return JSON.parse(JSON.stringify(event).replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')) as T
}
