import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { McuRecentActivityStore } from './mcu-recent-activity-store'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe('McuRecentActivityStore', () => {
  it('deduplicates navigation targets without changing workspace metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-recent-'))
    roots.push(root)
    const store = new McuRecentActivityStore(join(root, 'recent.json'))
    await store.record({ kind: 'lesson', courseId: 'course-one', lessonId: 'lesson-one' })
    await store.record({ kind: 'workspace', workspaceId: `ws_${'a'.repeat(24)}` })
    const recent = await store.record({ kind: 'lesson', courseId: 'course-one', lessonId: 'lesson-one' })
    expect(recent).toHaveLength(2)
    expect(recent[0]).toMatchObject({ kind: 'lesson', courseId: 'course-one', lessonId: 'lesson-one' })
  })
})
