import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CourseService } from './course-service'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('CourseService', () => {
  it('loads the current MCU course and its Lesson 01', async () => {
    const service = new CourseService({ rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations'), includeDrafts: true })
    const courses = await service.listCourses()
    expect(courses).toHaveLength(1)
    expect(courses[0]).toMatchObject({ courseId: 'ch32v203-foundations', contentVersion: 9, lessonCount: 1 })
    const course = await service.getCourse('ch32v203-foundations')
    expect(course.lessons.map((lesson) => lesson.lessonId)).toEqual(['first-program-on-chip'])
  })

  it('hides draft lessons outside development mode', async () => {
    const service = new CourseService({ rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations') })
    const course = await service.getCourse('ch32v203-foundations')
    expect(course.lessons).toHaveLength(0)
    await expect(service.getLesson('ch32v203-foundations', 'first-program-on-chip')).rejects.toThrow('COURSE_LESSON_NOT_FOUND')
  })

  it('resolves a published lesson to its registered workspace template and permissions', async () => {
    const service = new CourseService({
      rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations'),
      templatesRoot: join(process.cwd(), 'resources', 'workspace-templates', 'ch32v203-mcu-lessons'),
      includeDrafts: true
    })
    const spec = await service.getWorkspaceCreationSpec('ch32v203-foundations', 'first-program-on-chip')
    expect(spec).toMatchObject({ templateId: 'first-program-on-chip', templateVersion: 'content-v9' })
  })

  it('rejects a catalog path that escapes the configured root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-course-'))
    temporaryRoots.push(root)
    await writeFile(join(root, 'catalog.json'), JSON.stringify({ schemaVersion: 1, courses: [{ courseId: 'unsafe', manifest: '../outside.json' }] }))
    const service = new CourseService({ rootDir: root, includeDrafts: true })
    await expect(service.listCourses()).rejects.toThrow('COURSE_CATALOG_INVALID')
  })

  it('builds isolated task-specific AI context and preserves the draft hardware warning', async () => {
    const service = new CourseService({ rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations'), includeDrafts: true })
    const draft = await service.buildAiContext('ch32v203-foundations', 'first-program-on-chip', 'summary')
    expect(draft).toContain('pending-hardware-check')
    expect(draft).toContain('不得声称已观察到现象')
    expect(draft.length).toBeLessThan(8_000)
  })

  it('loads each lecture lazily as a safe model', async () => {
    const service = new CourseService({ rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations'), includeDrafts: true })
    const first = await service.getLecture('ch32v203-foundations', 'first-program-on-chip')
    expect(first.status).toBe('ready')
    if (first.status === 'ready') {
      expect(first.document.sections.map((section) => section.sectionId)).toContain('introduction')
      expect(JSON.stringify(first.document)).not.toContain('lecture.md')
    }
  })

  it('rebuilds lecture selections in Main and shares the 8000 character context budget', async () => {
    const service = new CourseService({ rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations'), includeDrafts: true })
    const lecture = await service.getLecture('ch32v203-foundations', 'first-program-on-chip')
    expect(lecture.status).toBe('ready')
    if (lecture.status !== 'ready') return
    const section = lecture.document.sections.find((item) => item.sectionId === 'introduction')!
    const node = section.textNodes.find((item) => item.text.length >= 8)!
    const context = await service.buildLectureQuestionContext('ch32v203-foundations', 'first-program-on-chip', {
      question: '这句话是什么意思？',
      selection: { documentDigest: lecture.document.documentDigest, sectionId: section.sectionId, start: { textNodeId: node.textNodeId, offset: 0 }, end: { textNodeId: node.textNodeId, offset: 8 } }
    })
    expect(context.selectedText).toBe(node.text.slice(0, 8))
    expect(context.trustedContext).toContain('lecture_context_json')
    expect(context.trustedContext.length).toBeLessThanOrEqual(8_000)
    await expect(service.buildLectureQuestionContext('ch32v203-foundations', 'first-program-on-chip', {
      question: '旧选区',
      selection: { documentDigest: '0'.repeat(64), sectionId: section.sectionId, start: { textNodeId: node.textNodeId, offset: 0 }, end: { textNodeId: node.textNodeId, offset: 2 } }
    })).rejects.toThrow('LECTURE_DOCUMENT_STALE')
  })

  it('does not parse an invalid lecture while loading the course catalog', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-course-lecture-isolation-'))
    temporaryRoots.push(root)
    await mkdir(join(root, 'course', 'lessons'), { recursive: true })
    await mkdir(join(root, 'course', 'lectures', 'lesson-a'), { recursive: true })
    await writeFile(join(root, 'catalog.json'), JSON.stringify({ schemaVersion: 1, courses: [{ courseId: 'course-one', manifest: 'course/course.json' }] }))
    await writeFile(join(root, 'course', 'course.json'), JSON.stringify({
      schemaVersion: 1, courseId: 'course-one', contentVersion: 1, title: '测试课程', summary: '测试讲义隔离', audience: '学生',
      objectives: ['验证隔离'], status: 'published', boardScope: '测试板', lessonOrder: ['lesson-a'], sourceAttribution: []
    }))
    await writeFile(join(root, 'course', 'lessons', 'lesson-a.json'), JSON.stringify(validLesson('lesson-a', [])))
    await writeFile(join(root, 'course', 'lectures', 'lesson-a', 'lecture.md'), '## 缺少 ID\n\n正文')
    const service = new CourseService({ rootDir: root, includeDrafts: true })
    await expect(service.listCourses()).resolves.toHaveLength(1)
    await expect(service.getLesson('course-one', 'lesson-a')).resolves.toMatchObject({ lessonId: 'lesson-a' })
    await expect(service.getLecture('course-one', 'lesson-a')).resolves.toMatchObject({ status: 'invalid', errorCode: 'LECTURE_H2_ID_REQUIRED' })
  })

  it('rejects a prerequisite that is not earlier in lessonOrder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-course-order-'))
    temporaryRoots.push(root)
    await mkdir(join(root, 'course', 'lessons'), { recursive: true })
    await writeFile(join(root, 'catalog.json'), JSON.stringify({ schemaVersion: 1, courses: [{ courseId: 'course-one', manifest: 'course/course.json' }] }))
    await writeFile(join(root, 'course', 'course.json'), JSON.stringify({
      schemaVersion: 1, courseId: 'course-one', contentVersion: 1, title: '测试课程', summary: '测试错误前置顺序', audience: '学生',
      objectives: ['验证顺序'], status: 'published', boardScope: '测试板', lessonOrder: ['lesson-a', 'lesson-b'], sourceAttribution: []
    }))
    await writeFile(join(root, 'course', 'lessons', 'lesson-a.json'), JSON.stringify(validLesson('lesson-a', ['lesson-b'])))
    await writeFile(join(root, 'course', 'lessons', 'lesson-b.json'), JSON.stringify(validLesson('lesson-b', [])))
    const service = new CourseService({ rootDir: root, includeDrafts: true })
    await expect(service.listCourses()).rejects.toThrow('COURSE_PREREQUISITE_ORDER_INVALID:lesson-a:lesson-b')
  })

  it('rejects a course step that targets a hidden or unlisted file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-course-target-'))
    temporaryRoots.push(root)
    await mkdir(join(root, 'course', 'lessons'), { recursive: true })
    await writeFile(join(root, 'catalog.json'), JSON.stringify({ schemaVersion: 1, courses: [{ courseId: 'course-one', manifest: 'course/course.json' }] }))
    await writeFile(join(root, 'course', 'course.json'), JSON.stringify({
      schemaVersion: 1, courseId: 'course-one', contentVersion: 1, title: '测试课程', summary: '测试文件定位', audience: '学生',
      objectives: ['验证定位'], status: 'published', boardScope: '测试板', lessonOrder: ['lesson-a'], sourceAttribution: []
    }))
    const lesson = validLesson('lesson-a', [])
    lesson.steps = [{ stepId: 'read-step', type: 'read', title: '阅读', instruction: '阅读内容', fileTarget: { path: '.git/config' } }]
    await writeFile(join(root, 'course', 'lessons', 'lesson-a.json'), JSON.stringify(lesson))
    const service = new CourseService({ rootDir: root, includeDrafts: true })
    await expect(service.listCourses()).rejects.toThrow('COURSE_FILE_TARGET_INVALID:lesson-a:read-step')
  })
})

function validLesson(lessonId: string, prerequisites: string[]): Record<string, unknown> {
  return {
    schemaVersion: 1, courseId: 'course-one', lessonId, title: lessonId, summary: '测试课次', objectives: ['测试'], prerequisites,
    estimatedMinutes: 10, hardware: 'none', verification: 'not-required', expectedObservation: '测试通过', templateId: lessonId,
    editableGlobs: ['App/Src/experiment.c'], readableFiles: [], deniedGlobs: [],
    steps: [{ stepId: 'read-step', type: 'read', title: '阅读', instruction: '阅读内容' }], completionChecks: [], reflectionQuestions: [],
    aiContext: { teachingFocus: '测试', hints: [] }, status: 'published'
  }
}
