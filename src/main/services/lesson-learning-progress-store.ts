import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { CourseLectureDocument, CourseLesson, LessonLearningProgress, LessonLearningProgressUpdate } from '../../shared/types'

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
const storedSchema = z.object({
  schemaVersion: z.literal(1),
  courseId: idSchema,
  lessonId: idSchema,
  contentVersion: z.number().int().positive(),
  documentDigest: digestSchema,
  completedSectionIds: z.array(idSchema),
  startedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  legacySeed: z.object({
    sourceContentVersion: z.literal(3),
    importedSectionIds: z.array(idSchema),
    seededAt: z.string().datetime()
  }).strict().optional()
}).strict()

type StoredLearningProgress = z.infer<typeof storedSchema>

export class LessonLearningProgressStore {
  private readonly rootDir: string
  private readonly queues = new Map<string, Promise<void>>()

  constructor(rootDir: string) { this.rootDir = resolve(rootDir) }

  async initialize(): Promise<void> { await mkdir(this.rootDir, { recursive: true }) }

  async list(courseId?: string): Promise<LessonLearningProgress[]> {
    if (courseId) idSchema.parse(courseId)
    await this.initialize()
    const entries = await readdir(this.rootDir, { withFileTypes: true })
    const results: LessonLearningProgress[] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      try {
        const value = storedSchema.parse(JSON.parse(await readFile(join(this.rootDir, entry.name), 'utf8')))
        if (!courseId || value.courseId === courseId) results.push(this.toSnapshot(value))
      } catch { /* A corrupt record is handled when its lesson is opened. */ }
    }
    return results.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async get(lesson: CourseLesson, document: CourseLectureDocument, legacySectionIds: string[] = []): Promise<LessonLearningProgress> {
    return this.serialize(this.keyFor(lesson.courseId, lesson.lessonId), async () => {
      const currentPath = this.pathFor(lesson.courseId, lesson.lessonId, lesson.contentVersion)
      try {
        const stored = storedSchema.parse(JSON.parse(await readFile(currentPath, 'utf8')))
        this.requireIdentity(stored, lesson)
        if (stored.documentDigest !== document.documentDigest) return { ...this.toSnapshot(stored), integrityError: true }
        return this.toSnapshot(stored)
      } catch (caught) {
        const code = caught as NodeJS.ErrnoException
        if (code.code !== 'ENOENT') {
          await rename(currentPath, `${currentPath}.corrupt-${Date.now()}.bak`).catch(() => undefined)
        }
        const created = await this.createInitial(lesson, document, legacySectionIds)
        await this.write(created)
        return { ...this.toSnapshot(created), recoveredFromCorruption: code.code !== 'ENOENT' }
      }
    })
  }

  async update(lesson: CourseLesson, document: CourseLectureDocument, input: LessonLearningProgressUpdate): Promise<LessonLearningProgress> {
    return this.serialize(this.keyFor(lesson.courseId, lesson.lessonId), async () => {
      const update = z.object({ kind: z.literal('section'), sectionId: idSchema, completed: z.boolean() }).strict().parse(input)
      const learningUnits = topLevelSectionIds(document)
      if (!learningUnits.includes(update.sectionId)) throw new Error('LESSON_LEARNING_SECTION_NOT_FOUND')
      const path = this.pathFor(lesson.courseId, lesson.lessonId, lesson.contentVersion)
      const stored = storedSchema.parse(JSON.parse(await readFile(path, 'utf8')))
      this.requireIdentity(stored, lesson)
      if (stored.documentDigest !== document.documentDigest) throw new Error('LESSON_LEARNING_RESOURCE_INTEGRITY_ERROR')
      const now = new Date().toISOString()
      const completed = new Set(stored.completedSectionIds)
      if (update.completed) completed.add(update.sectionId); else completed.delete(update.sectionId)
      const completedSectionIds = learningUnits.filter((sectionId) => completed.has(sectionId))
      const next: StoredLearningProgress = {
        ...stored,
        completedSectionIds,
        updatedAt: now,
        completedAt: completedSectionIds.length === learningUnits.length ? stored.completedAt ?? now : undefined
      }
      await this.write(next)
      return this.toSnapshot(next)
    })
  }

  private async createInitial(lesson: CourseLesson, document: CourseLectureDocument, legacySectionIds: string[]): Promise<StoredLearningProgress> {
    const units = topLevelSectionIds(document)
    let completedSectionIds: string[] = []
    let legacySeed: StoredLearningProgress['legacySeed']
    const compatible = await this.findCompatiblePrevious(lesson, units)
    if (compatible) completedSectionIds = compatible
    else {
      completedSectionIds = units.filter((sectionId) => legacySectionIds.includes(sectionId))
      if (completedSectionIds.length > 0) {
        const seededAt = new Date().toISOString()
        legacySeed = { sourceContentVersion: 3, importedSectionIds: completedSectionIds, seededAt }
      }
    }
    const now = new Date().toISOString()
    return {
      schemaVersion: 1,
      courseId: lesson.courseId,
      lessonId: lesson.lessonId,
      contentVersion: lesson.contentVersion,
      documentDigest: document.documentDigest,
      completedSectionIds,
      startedAt: now,
      updatedAt: now,
      completedAt: completedSectionIds.length === units.length ? now : undefined,
      ...(legacySeed ? { legacySeed } : {})
    }
  }

  private async findCompatiblePrevious(lesson: CourseLesson, currentUnits: string[]): Promise<string[] | undefined> {
    const versions = [...lesson.learningCompatibleFrom].sort((left, right) => right - left)
    for (const version of versions) {
      try {
        const stored = storedSchema.parse(JSON.parse(await readFile(this.pathFor(lesson.courseId, lesson.lessonId, version), 'utf8')))
        return currentUnits.filter((sectionId) => stored.completedSectionIds.includes(sectionId))
      } catch { /* Try the next declared compatible version. */ }
    }
    return undefined
  }

  private requireIdentity(stored: StoredLearningProgress, lesson: CourseLesson): void {
    if (stored.courseId !== lesson.courseId || stored.lessonId !== lesson.lessonId || stored.contentVersion !== lesson.contentVersion) throw new Error('LESSON_LEARNING_PROGRESS_INVALID')
  }

  private toSnapshot(stored: StoredLearningProgress): LessonLearningProgress { return structuredClone(stored) }

  private keyFor(courseId: string, lessonId: string): string { return `${idSchema.parse(courseId)}--${idSchema.parse(lessonId)}` }

  private pathFor(courseId: string, lessonId: string, contentVersion: number): string {
    return join(this.rootDir, `${this.keyFor(courseId, lessonId)}--v${z.number().int().positive().parse(contentVersion)}.json`)
  }

  private async write(progress: StoredLearningProgress): Promise<void> {
    const target = this.pathFor(progress.courseId, progress.lessonId, progress.contentVersion)
    const temporary = `${target}.tmp`
    await writeFile(temporary, `${JSON.stringify(progress, null, 2)}\n`, 'utf8')
    await rename(temporary, target)
  }

  private async serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve()
    let release = (): void => undefined
    const current = new Promise<void>((resolveQueue) => { release = resolveQueue })
    this.queues.set(key, current)
    await previous.catch(() => undefined)
    try { return await task() }
    finally {
      release()
      if (this.queues.get(key) === current) this.queues.delete(key)
    }
  }
}

export function topLevelSectionIds(document: CourseLectureDocument): string[] {
  return document.sections.filter((section) => section.level === 2).map((section) => section.sectionId)
}
