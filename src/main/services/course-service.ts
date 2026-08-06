import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { CourseDetail, CourseLesson, CourseLessonSummary, CourseSummary } from '../../shared/types'
import type { WorkspaceCreationSpec } from './workspace-service'

const idSchema = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const resourcePathSchema = z.string().min(1).max(180).refine((value) => {
  const normalized = value.replace(/\\/g, '/')
  return !isAbsolute(value) && !normalized.startsWith('/') && !normalized.split('/').includes('..')
}, 'resource path must stay inside the course root')

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  courses: z.array(z.object({ courseId: idSchema, manifest: resourcePathSchema }).strict()).min(1)
}).strict()

const courseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  courseId: idSchema,
  contentVersion: z.number().int().positive(),
  title: z.string().min(1).max(80),
  summary: z.string().min(1).max(300),
  audience: z.string().min(1).max(120),
  objectives: z.array(z.string().min(1).max(160)).min(1),
  status: z.enum(['draft', 'published']),
  boardScope: z.string().min(1).max(120),
  lessonOrder: z.array(idSchema).min(1),
  sourceAttribution: z.array(z.string().min(1).max(240))
}).strict()

const lessonManifestSchema = z.object({
  schemaVersion: z.literal(1),
  courseId: idSchema,
  lessonId: idSchema,
  title: z.string().min(1).max(80),
  summary: z.string().min(1).max(300),
  objectives: z.array(z.string().min(1).max(160)).min(1),
  prerequisites: z.array(idSchema),
  estimatedMinutes: z.number().int().min(5).max(480),
  hardware: z.enum(['none', 'optional', 'required']),
  verification: z.enum(['not-required', 'pending-hardware-check', 'hardware-checked']),
  expectedObservation: z.string().min(1).max(400),
  templateId: idSchema,
  editableGlobs: z.array(z.string().min(1).max(160)),
  readableFiles: z.array(z.string().min(1).max(160)),
  deniedGlobs: z.array(z.string().min(1).max(160)),
  steps: z.array(z.object({
    stepId: idSchema,
    type: z.enum(['read', 'edit', 'candidate-build', 'review-apply', 'firmware-build', 'flash', 'serial-observation', 'hardware-observation', 'question', 'summary']),
    title: z.string().min(1).max(80),
    instruction: z.string().min(1).max(500)
  }).strict()).min(1),
  completionChecks: z.array(z.object({
    type: z.enum(['file-exists', 'candidate-build-passed', 'firmware-build-passed', 'flash-succeeded', 'manual-observation-confirmed', 'question-answered']),
    target: z.string().min(1).max(160).optional()
  }).strict()),
  reflectionQuestions: z.array(z.object({ questionId: idSchema, prompt: z.string().min(1).max(300) }).strict()),
  aiContext: z.object({ teachingFocus: z.string().min(1).max(500), hints: z.array(z.string().min(1).max(300)).max(8) }).strict(),
  status: z.enum(['draft', 'published'])
}).strict()

type CourseManifest = z.infer<typeof courseManifestSchema>
type LessonManifest = z.infer<typeof lessonManifestSchema>

export interface CourseServiceOptions {
  rootDir: string
  templatesRoot?: string
  includeDrafts?: boolean
}

export class CourseService {
  private readonly rootDir: string
  private readonly templatesRoot?: string
  private readonly includeDrafts: boolean

  constructor(options: CourseServiceOptions) {
    this.rootDir = resolve(options.rootDir)
    this.templatesRoot = options.templatesRoot ? resolve(options.templatesRoot) : undefined
    this.includeDrafts = options.includeDrafts ?? false
  }

  async listCourses(): Promise<CourseSummary[]> {
    const entries = await this.loadAllCourses()
    return entries.map(({ detail }) => this.toSummary(detail))
  }

  async getCourse(courseId: string): Promise<CourseDetail> {
    this.requireId(courseId)
    const entry = (await this.loadAllCourses()).find(({ detail }) => detail.courseId === courseId)
    if (!entry) throw new Error('COURSE_NOT_FOUND')
    return structuredClone(entry.detail)
  }

  async getLesson(courseId: string, lessonId: string): Promise<CourseLesson> {
    this.requireId(courseId)
    this.requireId(lessonId)
    const entry = (await this.loadAllCourses()).find(({ detail }) => detail.courseId === courseId)
    if (!entry) throw new Error('COURSE_NOT_FOUND')
    const lesson = entry.lessons.find((item) => item.lessonId === lessonId)
    if (!lesson) throw new Error('COURSE_LESSON_NOT_FOUND')
    return structuredClone(lesson)
  }

  async getWorkspaceCreationSpec(courseId: string, lessonId: string): Promise<WorkspaceCreationSpec> {
    if (!this.templatesRoot) throw new Error('COURSE_TEMPLATE_ROOT_UNAVAILABLE')
    const [course, lesson] = await Promise.all([this.getCourse(courseId), this.getLesson(courseId, lessonId)])
    if (lesson.status !== 'published') throw new Error('COURSE_LESSON_NOT_PUBLISHED')
    if (lesson.verification === 'pending-hardware-check') throw new Error('COURSE_LESSON_HARDWARE_UNVERIFIED')
    const templateRoot = resolve(this.templatesRoot, lesson.templateId)
    const fromRoot = relative(this.templatesRoot, templateRoot)
    if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) throw new Error('COURSE_TEMPLATE_PATH_INVALID')
    return {
      workspacePurpose: 'mcu-lesson-attempt',
      templateId: lesson.templateId,
      templateVersion: `content-v${course.contentVersion}`,
      templateRoot,
      courseBinding: { courseId, lessonId, contentVersion: course.contentVersion },
      lessonTitle: lesson.title,
      allowedEditGlobs: [...lesson.editableGlobs],
      deniedGlobs: [...lesson.deniedGlobs]
    }
  }

  private async loadAllCourses(): Promise<Array<{ detail: CourseDetail; lessons: CourseLesson[] }>> {
    const catalog = await this.readAndParse('catalog.json', catalogSchema, 'COURSE_CATALOG')
    const seen = new Set<string>()
    const courses: Array<{ detail: CourseDetail; lessons: CourseLesson[] }> = []
    for (const item of catalog.courses) {
      if (seen.has(item.courseId)) throw new Error(`COURSE_ID_DUPLICATE:${item.courseId}`)
      seen.add(item.courseId)
      const manifest = await this.readAndParse(item.manifest, courseManifestSchema, 'COURSE_MANIFEST')
      if (manifest.courseId !== item.courseId) throw new Error(`COURSE_ID_MISMATCH:${item.courseId}`)
      if (manifest.status === 'draft' && !this.includeDrafts) continue
      const lessons = await this.loadLessons(item.manifest, manifest)
      const visibleLessons = lessons.filter((lesson) => this.includeDrafts || lesson.status === 'published')
      courses.push({
        lessons: visibleLessons,
        detail: {
          ...this.toSummary({ ...manifest, lessonCount: visibleLessons.length }),
          objectives: [...manifest.objectives],
          sourceAttribution: [...manifest.sourceAttribution],
          lessons: visibleLessons.map((lesson) => this.toLessonSummary(lesson))
        }
      })
    }
    return courses
  }

  private async loadLessons(courseManifestPath: string, course: CourseManifest): Promise<CourseLesson[]> {
    const courseDir = dirname(courseManifestPath).replace(/\\/g, '/')
    const lessonIds = new Set(course.lessonOrder)
    if (lessonIds.size !== course.lessonOrder.length) throw new Error(`COURSE_LESSON_ORDER_DUPLICATE:${course.courseId}`)
    const lessons: CourseLesson[] = []
    for (const [order, lessonId] of course.lessonOrder.entries()) {
      const relativePath = `${courseDir}/lessons/${lessonId}.json`
      const lesson = await this.readAndParse(relativePath, lessonManifestSchema, 'COURSE_LESSON')
      if (lesson.courseId !== course.courseId || lesson.lessonId !== lessonId) throw new Error(`COURSE_LESSON_ID_MISMATCH:${lessonId}`)
      for (const prerequisite of lesson.prerequisites) {
        if (!lessonIds.has(prerequisite) || prerequisite === lessonId) throw new Error(`COURSE_PREREQUISITE_INVALID:${lessonId}:${prerequisite}`)
      }
      lessons.push({ ...lesson, order })
    }
    return lessons
  }

  private toSummary(course: Pick<CourseDetail, 'courseId' | 'contentVersion' | 'title' | 'summary' | 'audience' | 'status' | 'boardScope' | 'lessonCount'>): CourseSummary {
    return {
      courseId: course.courseId,
      contentVersion: course.contentVersion,
      title: course.title,
      summary: course.summary,
      audience: course.audience,
      status: course.status,
      boardScope: course.boardScope,
      lessonCount: course.lessonCount
    }
  }

  private toLessonSummary(lesson: CourseLesson): CourseLessonSummary {
    const { courseId, lessonId, title, summary, estimatedMinutes, hardware, verification, status, prerequisites, order } = lesson
    return { courseId, lessonId, title, summary, estimatedMinutes, hardware, verification, status, prerequisites: [...prerequisites], order }
  }

  private requireId(value: string): void {
    if (!idSchema.safeParse(value).success) throw new Error('COURSE_ID_INVALID')
  }

  private async readAndParse<T>(relativePath: string, schema: z.ZodType<T>, label: string): Promise<T> {
    const path = this.resolveResource(relativePath)
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(path, 'utf8'))
    } catch {
      throw new Error(`${label}_READ_FAILED:${relativePath}`)
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new Error(`${label}_INVALID:${relativePath}`)
    return parsed.data
  }

  private resolveResource(relativePath: string): string {
    if (!resourcePathSchema.safeParse(relativePath).success) throw new Error('COURSE_RESOURCE_PATH_INVALID')
    const target = resolve(this.rootDir, ...relativePath.replace(/\\/g, '/').split('/'))
    const fromRoot = relative(this.rootDir, target)
    if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) throw new Error('COURSE_RESOURCE_PATH_INVALID')
    return target
  }
}
