import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentEvent, CourseLectureHistoryScope } from '../../shared/types'
import { CourseLectureHistoryService } from './course-lecture-history-service'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe('CourseLectureHistoryService', () => {
  it('keeps version scope and hides older answers by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-lecture-history-'))
    roots.push(root)
    const service = new CourseLectureHistoryService(root)
    await service.initialize()
    await appendTurn(service, 'old', { courseId: 'course-one', lessonId: 'lesson-one', contentVersion: 4, documentDigest: 'a'.repeat(64) })
    await appendTurn(service, 'current', { courseId: 'course-one', lessonId: 'lesson-one', contentVersion: 5, documentDigest: 'b'.repeat(64) })
    const current = await service.list('course-one', 'lesson-one', false, { contentVersion: 5, documentDigest: 'b'.repeat(64) })
    expect(current.some((event) => event.turnId === 'turn_old')).toBe(false)
    expect(current.some((event) => event.turnId === 'turn_current')).toBe(true)
    expect(await service.list('course-one', 'lesson-one', true)).toHaveLength(4)
  })
})

async function appendTurn(service: CourseLectureHistoryService, suffix: string, lectureScope: CourseLectureHistoryScope): Promise<void> {
  const base = { turnId: `turn_${suffix}`, timestamp: new Date().toISOString() }
  await service.append({ ...base, eventId: `event_${suffix}_start`, sequence: 1, type: 'turn_started', lectureScope, message: `${suffix} question` } as AgentEvent)
  await service.append({ ...base, eventId: `event_${suffix}_answer`, sequence: 2, type: 'assistant_delta', text: `${suffix} answer` } as AgentEvent)
}
