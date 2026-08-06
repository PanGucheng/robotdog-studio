import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    expect(courses[0]).toMatchObject({ courseId: 'ch32v203-foundations', contentVersion: 1, lessonCount: 3 })
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
      templateVersion: 'content-v1',
      courseBinding: { courseId: 'ch32v203-foundations', lessonId: 'c-files-and-functions', contentVersion: 1 }
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
})
