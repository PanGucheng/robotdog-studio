import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { CourseLectureDocument, CourseLesson } from '../../shared/types'
import { LessonLearningProgressStore, topLevelSectionIds } from './lesson-learning-progress-store'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

describe('LessonLearningProgressStore', () => {
  it('uses only H2 sections as completion units and imports explicit v3 evidence once', async () => {
    const store = await createStore()
    const lesson = makeLesson(4, [])
    const document = makeDocument(4, 'a'.repeat(64))
    expect(topLevelSectionIds(document)).toEqual(['intro', 'build'])
    const seeded = await store.get(lesson, document, ['intro', 'nested', 'unknown'])
    expect(seeded.completedSectionIds).toEqual(['intro'])
    expect(seeded.legacySeed?.importedSectionIds).toEqual(['intro'])
    const completed = await store.update(lesson, document, { kind: 'section', sectionId: 'build', completed: true })
    expect(completed.completedAt).toBeDefined()
    await expect(store.update(lesson, document, { kind: 'section', sectionId: 'nested', completed: true })).rejects.toThrow('LESSON_LEARNING_SECTION_NOT_FOUND')
  })

  it('migrates only from independently declared learning-compatible versions', async () => {
    const store = await createStore()
    const v4 = makeLesson(4, [])
    const v4Document = makeDocument(4, 'b'.repeat(64))
    await store.get(v4, v4Document)
    await store.update(v4, v4Document, { kind: 'section', sectionId: 'intro', completed: true })
    const migrated = await store.get(makeLesson(5, [4]), makeDocument(5, 'c'.repeat(64)))
    expect(migrated.completedSectionIds).toEqual(['intro'])
    const independent = await store.get(makeLesson(6, []), makeDocument(6, 'd'.repeat(64)))
    expect(independent.completedSectionIds).toEqual([])
  })

  it('flags same-version document changes as an integrity error', async () => {
    const store = await createStore()
    const lesson = makeLesson(4, [])
    await store.get(lesson, makeDocument(4, 'e'.repeat(64)))
    const changed = await store.get(lesson, makeDocument(4, 'f'.repeat(64)))
    expect(changed.integrityError).toBe(true)
  })
})

async function createStore(): Promise<LessonLearningProgressStore> {
  const root = await mkdtemp(join(tmpdir(), 'robotdog-learning-'))
  roots.push(root)
  return new LessonLearningProgressStore(root)
}

function makeLesson(contentVersion: number, learningCompatibleFrom: number[]): CourseLesson {
  return { courseId: 'course-one', lessonId: 'lesson-one', contentVersion, progressCompatibleFrom: [], learningCompatibleFrom } as unknown as CourseLesson
}

function makeDocument(contentVersion: number, documentDigest: string): CourseLectureDocument {
  return {
    courseId: 'course-one', lessonId: 'lesson-one', contentVersion, documentDigest, assets: [], codeTargetIndex: {}, taskLinkIndex: {},
    sections: [
      { sectionId: 'intro', title: '介绍', level: 2, order: 0, blocks: [], textNodes: [], canonicalText: '' },
      { sectionId: 'nested', title: '细节', level: 3, order: 1, blocks: [], textNodes: [], canonicalText: '' },
      { sectionId: 'build', title: '构建', level: 2, order: 2, blocks: [], textNodes: [], canonicalText: '' }
    ]
  }
}
