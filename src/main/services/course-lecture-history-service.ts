import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentEvent, CourseLectureHistoryScope } from '../../shared/types'
import { compactAgentEvents } from '../../shared/agent-event-history'

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const persistedTypes = new Set<AgentEvent['type']>(['turn_started', 'plan', 'assistant_delta', 'activity', 'completed', 'cancelled', 'failed'])

export class CourseLectureHistoryService {
  private readonly turnScopes = new Map<string, CourseLectureHistoryScope>()
  private queue = Promise.resolve()

  constructor(private readonly rootDir: string) {}

  async initialize(): Promise<void> { await mkdir(this.rootDir, { recursive: true }) }

  append(event: AgentEvent): Promise<void> {
    if (event.type === 'turn_started' && event.lectureScope) this.turnScopes.set(event.turnId, event.lectureScope)
    const scope = event.type === 'turn_started' ? event.lectureScope : this.turnScopes.get(event.turnId)
    if (!scope || !validScope(scope) || !persistedTypes.has(event.type)) return Promise.resolve()
    this.queue = this.queue.catch(() => undefined).then(async () => {
      const events = await this.list(scope.courseId, scope.lessonId, true)
      if (!events.some((item) => item.eventId === event.eventId)) events.push(redactEvent(event))
      await this.write(scope.courseId, scope.lessonId, compactAgentEvents(events))
    })
    return this.queue
  }

  async list(courseId: string, lessonId: string, includeOlder: boolean, current?: Pick<CourseLectureHistoryScope, 'contentVersion' | 'documentDigest'>): Promise<AgentEvent[]> {
    if (!idPattern.test(courseId) || !idPattern.test(lessonId)) throw new Error('COURSE_LECTURE_HISTORY_ID_INVALID')
    const text = await readFile(this.pathFor(courseId, lessonId), 'utf8').catch(() => '')
    const scopes = new Map<string, CourseLectureHistoryScope>()
    const events = text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const event = JSON.parse(line) as AgentEvent
        if (!event || typeof event.eventId !== 'string' || !persistedTypes.has(event.type)) return []
        if (event.type === 'turn_started' && event.lectureScope && validScope(event.lectureScope)) scopes.set(event.turnId, event.lectureScope)
        return [event]
      } catch { return [] }
    })
    for (const [turnId, scope] of scopes) this.turnScopes.set(turnId, scope)
    const filtered = includeOlder || !current ? events : events.filter((event) => {
      const scope = event.type === 'turn_started' ? event.lectureScope : scopes.get(event.turnId)
      return scope?.contentVersion === current.contentVersion && scope.documentDigest === current.documentDigest
    })
    return compactAgentEvents(filtered)
  }

  private pathFor(courseId: string, lessonId: string): string { return join(this.rootDir, `${courseId}--${lessonId}.jsonl`) }

  private async write(courseId: string, lessonId: string, events: AgentEvent[]): Promise<void> {
    const target = this.pathFor(courseId, lessonId)
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

function validScope(scope: CourseLectureHistoryScope): boolean {
  return idPattern.test(scope.courseId) && idPattern.test(scope.lessonId) && Number.isInteger(scope.contentVersion)
    && /^[a-f0-9]{64}$/.test(scope.documentDigest) && (!scope.workspaceId || /^ws_[a-f0-9]{24}$/.test(scope.workspaceId))
}

function redactEvent<T extends AgentEvent>(event: T): T {
  return JSON.parse(JSON.stringify(event).replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')) as T
}
