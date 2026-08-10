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
  it('loads the current MCU course and its three development lessons', async () => {
    const service = new CourseService({ rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations'), includeDrafts: true })
    const courses = await service.listCourses()
    expect(courses).toHaveLength(1)
    expect(courses[0]).toMatchObject({ courseId: 'ch32v203-foundations', contentVersion: 4, lessonCount: 3 })
    const course = await service.getCourse('ch32v203-foundations')
    expect(course.lessons.map((lesson) => lesson.lessonId)).toEqual([
      'studio-first-build',
      'c-files-and-functions',
      'first-hardware-placeholder'
    ])
  })

  it('hides draft lessons outside development mode', async () => {
    const service = new CourseService({ rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations') })
    const course = await service.getCourse('ch32v203-foundations')
    expect(course.lessons).toHaveLength(2)
    await expect(service.getLesson('ch32v203-foundations', 'first-hardware-placeholder')).rejects.toThrow('COURSE_LESSON_NOT_FOUND')
  })

  it('resolves a published lesson to its registered workspace template and permissions', async () => {
    const service = new CourseService({
      rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations'),
      templatesRoot: join(process.cwd(), 'resources', 'workspace-templates', 'ch32v203-mcu-lessons'),
      includeDrafts: true
    })
    const spec = await service.getWorkspaceCreationSpec('ch32v203-foundations', 'c-files-and-functions')
    expect(spec).toMatchObject({
      templateId: 'c-files-and-functions',
      templateVersion: 'content-v4',
      courseBinding: { courseId: 'ch32v203-foundations', lessonId: 'c-files-and-functions', contentVersion: 4 }
    })
    expect(spec.allowedEditGlobs).toContain('App/Src/number_tools.c')
    await expect(service.getWorkspaceCreationSpec('ch32v203-foundations', 'first-hardware-placeholder')).rejects.toThrow('COURSE_LESSON_NOT_PUBLISHED')
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
    const first = await service.buildAiContext('ch32v203-foundations', 'studio-first-build', 'explain-code')
    const second = await service.buildAiContext('ch32v203-foundations', 'c-files-and-functions', 'modify')
    const draft = await service.buildAiContext('ch32v203-foundations', 'first-hardware-placeholder', 'summary')
    expect(first).toContain('认识 Studio 与第一次编译')
    expect(first).not.toContain('源文件、头文件与函数')
    expect(second).toContain('App/Src/number_tools.c')
    expect(second).toContain('真正权限仍由 Studio 策略决定')
    expect(draft).toContain('pending-hardware-check')
    expect(draft).toContain('不得声称已观察到现象')
    expect(draft.length).toBeLessThan(8_000)
  })

  it('loads each lecture lazily as a safe model', async () => {
    const service = new CourseService({ rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations'), includeDrafts: true })
    const first = await service.getLecture('ch32v203-foundations', 'studio-first-build')
    const second = await service.getLecture('ch32v203-foundations', 'c-files-and-functions')
    const draft = await service.getLecture('ch32v203-foundations', 'first-hardware-placeholder')
    expect(first.status).toBe('ready')
    expect(second.status).toBe('ready')
    if (first.status === 'ready') {
      expect(first.document.sections.map((section) => section.sectionId)).toContain('studio-workflow')
      expect(first.document.codeTargetIndex['App/Src/experiment.c']).toContain('source-code')
      expect(JSON.stringify(first.document)).not.toContain('lecture.md')
    }
    if (second.status === 'ready') expect(second.document.taskLinkIndex['implement-helper']).toContain('lesson-project')
    expect(draft).toEqual({ status: 'missing' })
  })

  it('rebuilds lecture selections in Main and shares the 8000 character context budget', async () => {
    const service = new CourseService({ rootDir: join(process.cwd(), 'resources', 'courses', 'mcu-foundations'), includeDrafts: true })
    const lecture = await service.getLecture('ch32v203-foundations', 'studio-first-build')
    expect(lecture.status).toBe('ready')
    if (lecture.status !== 'ready') return
    const section = lecture.document.sections.find((item) => item.sectionId === 'studio-workflow')!
    const node = section.textNodes.find((item) => item.text.length >= 8)!
    const context = await service.buildLectureQuestionContext('ch32v203-foundations', 'studio-first-build', {
      question: '这句话是什么意思？',
      selection: { documentDigest: lecture.document.documentDigest, sectionId: section.sectionId, start: { textNodeId: node.textNodeId, offset: 0 }, end: { textNodeId: node.textNodeId, offset: 8 } }
    })
    expect(context.selectedText).toBe(node.text.slice(0, 8))
    expect(context.trustedContext).toContain('lecture_context_json')
    expect(context.trustedContext.length).toBeLessThanOrEqual(8_000)
    await expect(service.buildLectureQuestionContext('ch32v203-foundations', 'studio-first-build', {
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
