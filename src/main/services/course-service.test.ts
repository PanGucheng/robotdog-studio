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

  it('rejects a catalog path that escapes the configured root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-course-'))
    temporaryRoots.push(root)
    await writeFile(join(root, 'catalog.json'), JSON.stringify({ schemaVersion: 1, courses: [{ courseId: 'unsafe', manifest: '../outside.json' }] }))
    const service = new CourseService({ rootDir: root, includeDrafts: true })
    await expect(service.listCourses()).rejects.toThrow('COURSE_CATALOG_INVALID')
  })
})
