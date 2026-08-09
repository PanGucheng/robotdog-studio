import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { CourseService } from '../src/main/services/course-service'

const root = process.cwd()
const courseRoot = resolve(root, 'resources', 'courses', 'mcu-foundations')
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const service = new CourseService({
  rootDir: courseRoot,
  templatesRoot: join(root, 'resources', 'workspace-templates', 'ch32v203-mcu-lessons'),
  includeDrafts: true
})

const catalog = await readJsonInside(courseRoot, 'catalog.json') as { schemaVersion?: number; courses?: Array<{ courseId: string; manifest: string }> }
requireValue(catalog.schemaVersion === 1 && Array.isArray(catalog.courses), 'catalog.json 格式无效')
await service.listCourses()
const courseIds = new Set<string>()
let lessonCount = 0
let lectureCount = 0

for (const entry of catalog.courses!) {
  requireId(entry.courseId, 'catalog courseId')
  requireValue(!courseIds.has(entry.courseId), `课程 ID 重复：${entry.courseId}`)
  courseIds.add(entry.courseId)
  const course = await readJsonInside(courseRoot, entry.manifest) as Record<string, unknown> & {
    schemaVersion: number; courseId: string; contentVersion: number; status: string; lessonOrder: string[]; progressCompatibleFrom?: number[]
  }
  requireValue(course.schemaVersion === 1 && course.courseId === entry.courseId, `课程 manifest 身份不一致：${entry.courseId}`)
  requireValue(Number.isInteger(course.contentVersion) && course.contentVersion > 0, `课程 contentVersion 无效：${entry.courseId}`)
  requireValue(['draft', 'published'].includes(course.status), `课程状态无效：${entry.courseId}`)
  requireValue(Array.isArray(course.lessonOrder) && course.lessonOrder.length > 0, `课程没有课次：${entry.courseId}`)
  const lessonIds = new Set(course.lessonOrder)
  requireValue(lessonIds.size === course.lessonOrder.length, `课次顺序存在重复 ID：${entry.courseId}`)
  const courseDir = entry.manifest.replace(/\\/g, '/').replace(/\/[^/]+$/, '')
  const rawLessons = new Map<string, Record<string, unknown>>()

  for (const [lessonIndex, lessonId] of course.lessonOrder.entries()) {
    requireId(lessonId, 'lessonId')
    const lessonPath = `${courseDir}/lessons/${lessonId}.json`
    const lesson = await readJsonInside(courseRoot, lessonPath) as Record<string, unknown> & {
      schemaVersion: number; courseId: string; lessonId: string; status: string; hardware: string; verification: string; prerequisites: string[];
      steps: Array<{ stepId: string; type: string; questionId?: string; lectureSectionId?: string }>;
      reflectionQuestions?: Array<{ questionId: string }>;
      completionChecks?: Array<{ type: string; target?: string }>;
      templateId: string
    }
    rawLessons.set(lessonId, lesson)
    requireValue(lesson.schemaVersion === 1 && lesson.courseId === entry.courseId && lesson.lessonId === lessonId, `课次身份不一致：${lessonId}`)
    requireValue(['draft', 'published'].includes(lesson.status), `课次状态无效：${lessonId}`)
    requireValue(['none', 'optional', 'required'].includes(lesson.hardware), `课次硬件要求无效：${lessonId}`)
    requireValue(['not-required', 'pending-hardware-check', 'hardware-checked'].includes(lesson.verification), `课次验证状态无效：${lessonId}`)
    requireValue(!(lesson.status === 'published' && lesson.verification === 'pending-hardware-check'), `未通过硬件验证的课次不能发布：${lessonId}`)
    requireValue(Array.isArray(lesson.steps) && lesson.steps.length > 0, `课次没有实验步骤：${lessonId}`)
    requireValue(Array.isArray(lesson.prerequisites) && lesson.prerequisites.every((item) => lessonIds.has(item) && course.lessonOrder.indexOf(item) < lessonIndex), `课次前置顺序无效：${lessonId}`)
    const questionIds = new Set((lesson.reflectionQuestions ?? []).map((question) => question.questionId))
    requireValue(lesson.steps.filter((step) => step.type === 'question').every((step) => typeof step.questionId === 'string' && questionIds.has(step.questionId)), `问题步骤映射无效：${lessonId}`)
    requireValue((lesson.completionChecks ?? []).every((check) => check.type !== 'manual-observation-confirmed' || lesson.steps.some((step) => step.stepId === check.target && ['serial-observation', 'hardware-observation'].includes(step.type))), `观察完成条件映射无效：${lessonId}`)
    requireId(lesson.templateId, `templateId (${lessonId})`)
    const templateRoot = await resolveTemplateRoot(lesson.templateId)
    requireValue(await directoryExists(templateRoot), `课次模板不存在：${lesson.templateId}`)

    const lecture = await service.getLecture(entry.courseId, lessonId)
    if (lesson.status === 'published') requireValue(lecture.status === 'ready', `正式课次讲义无效：${lessonId} (${lecture.status === 'invalid' ? lecture.errorCode : 'missing'})`)
    if (lecture.status === 'invalid') throw new Error(`课次讲义无效：${lessonId} (${lecture.errorCode}${lecture.line ? `:${lecture.line}:${lecture.column ?? 1}` : ''})`)
    if (lecture.status === 'ready') lectureCount += 1
    lessonCount += 1
  }

  for (const fromVersion of course.progressCompatibleFrom ?? []) {
    requireValue(Number.isInteger(fromVersion) && fromVersion > 0 && fromVersion < course.contentVersion, `兼容来源版本无效：${entry.courseId} v${fromVersion}`)
    const compatibility = await readJsonInside(courseRoot, `${courseDir}/compatibility/progress-v${fromVersion}.json`) as {
      schemaVersion: number; fromContentVersion: number; publishedLessonIds: string[]; courseSemanticSha256: string; lessonSemanticSha256: Record<string, string>
    }
    requireValue(compatibility.schemaVersion === 1 && compatibility.fromContentVersion === fromVersion, `兼容快照身份无效：${entry.courseId} v${fromVersion}`)
    const compatibleLessons = course.lessonOrder.filter((lessonId) => {
      const lesson = rawLessons.get(lessonId) as { status?: string; verification?: string }
      return lesson.status === 'published' && lesson.verification !== 'pending-hardware-check'
    })
    requireValue(JSON.stringify(compatibility.publishedLessonIds) === JSON.stringify(compatibleLessons), `兼容快照没有覆盖全部旧正式课：${entry.courseId} v${fromVersion}`)
    const normalizedCourse = structuredClone(course)
    delete normalizedCourse.contentVersion
    delete normalizedCourse.progressCompatibleFrom
    requireValue(semanticHash(normalizedCourse) === compatibility.courseSemanticSha256, `课程教学语义与 v${fromVersion} 不兼容：${entry.courseId}`)
    for (const lessonId of compatibleLessons) {
      const normalizedLesson = structuredClone(rawLessons.get(lessonId)!) as { steps?: Array<Record<string, unknown>> }
      for (const step of normalizedLesson.steps ?? []) delete step.lectureSectionId
      requireValue(semanticHash(normalizedLesson) === compatibility.lessonSemanticSha256[lessonId], `课次教学语义与 v${fromVersion} 不兼容：${lessonId}`)
    }
  }
}

console.log(`MCU_COURSES_OK courses=${courseIds.size} lessons=${lessonCount} lectures=${lectureCount}`)

async function resolveTemplateRoot(templateId: string): Promise<string> {
  if (templateId === 'ch32v203-mcu-foundations') {
    const registry = JSON.parse(await readFile(join(root, 'resources', 'firmware-baselines', 'ch32v203-robotdog', 'active.json'), 'utf8')) as { shortCommit?: string }
    return join(root, 'resources', 'workspace-templates', templateId, registry.shortCommit ?? '2026.06')
  }
  return join(root, 'resources', 'workspace-templates', 'ch32v203-mcu-lessons', templateId)
}

async function readJsonInside(base: string, relativePath: string): Promise<unknown> {
  requireValue(typeof relativePath === 'string' && relativePath.length > 0 && !isAbsolute(relativePath), '课程资源路径无效')
  const target = resolve(base, ...relativePath.replace(/\\/g, '/').split('/'))
  const fromBase = relative(base, target)
  requireValue(fromBase && fromBase !== '..' && !fromBase.startsWith(`..${sep}`) && !isAbsolute(fromBase), `课程资源路径越界：${relativePath}`)
  return JSON.parse(await readFile(target, 'utf8'))
}

function semanticHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue((value as Record<string, unknown>)[key])]))
  return value
}

function requireId(value: unknown, label: string): asserts value is string {
  requireValue(typeof value === 'string' && idPattern.test(value), `${label} 无效：${String(value)}`)
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function directoryExists(path: string): Promise<boolean> {
  return stat(path).then((info) => info.isDirectory(), () => false)
}
