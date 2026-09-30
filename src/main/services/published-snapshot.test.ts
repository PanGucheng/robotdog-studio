import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CourseService } from './course-service'
import { exportPublishedSnapshot } from './published-snapshot'

const temporaryDirs: string[] = []
const repoRoot = resolve(import.meta.dirname, '..', '..', '..')

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('exportPublishedSnapshot', () => {
  it('generates a clean published snapshot separating published Lesson 1 from draft Lesson 2', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'published-snapshot-'))
    temporaryDirs.push(outputDir)

    const result = exportPublishedSnapshot({
      editionId: 'mcu-foundations',
      studioRoot: repoRoot,
      outputDir
    })

    expect(result.editionId).toBe('mcu-foundations')
    expect(result.publishedCourses).toEqual([
      {
        courseId: 'ch32v203-foundations',
        publishedLessonIds: ['first-program-on-chip']
      }
    ])
    expect(result.publishedTemplateIds).toEqual(['first-program-on-chip'])

    // 1. Verify courses directory
    const publishedCourseJsonPath = join(outputDir, 'courses', 'ch32v203-foundations', 'course.json')
    expect(existsSync(publishedCourseJsonPath)).toBe(true)
    const publishedCourse = JSON.parse(readFileSync(publishedCourseJsonPath, 'utf8')) as {
      status: string
      contentVersion: number
      lessonOrder: string[]
    }
    expect(publishedCourse.status).toBe('published')
    expect(publishedCourse.contentVersion).toBe(13)
    // Section 9: lessonOrder must be rebuilt containing ONLY published lessons
    expect(publishedCourse.lessonOrder).toEqual(['first-program-on-chip'])

    // Section 10: Draft lesson gpio-output is NOT included in lessons/ or lectures/
    expect(existsSync(join(outputDir, 'courses', 'ch32v203-foundations', 'lessons', 'first-program-on-chip.json'))).toBe(true)
    expect(existsSync(join(outputDir, 'courses', 'ch32v203-foundations', 'lessons', 'gpio-output.json'))).toBe(false)
    expect(existsSync(join(outputDir, 'courses', 'ch32v203-foundations', 'lectures', 'first-program-on-chip'))).toBe(true)
    expect(existsSync(join(outputDir, 'courses', 'ch32v203-foundations', 'lectures', 'gpio-output'))).toBe(false)

    // Section 11: Draft lesson template is NOT included in workspace-templates
    expect(existsSync(join(outputDir, 'workspace-templates', 'ch32v203-mcu-lessons', 'first-program-on-chip'))).toBe(true)
    expect(existsSync(join(outputDir, 'workspace-templates', 'ch32v203-mcu-lessons', 'first-program-on-chip', 'App', 'Src', 'experiment.c'))).toBe(true)
    expect(existsSync(join(outputDir, 'workspace-templates', 'ch32v203-mcu-lessons', 'gpio-output'))).toBe(false)

    // Section 12: Generic templates and baselines are preserved
    expect(existsSync(join(outputDir, 'workspace-templates', 'ch32v203-pony'))).toBe(true)
    expect(existsSync(join(outputDir, 'firmware-baselines', 'ch32v203-rhs', 'active.json'))).toBe(true)
    expect(existsSync(join(outputDir, 'firmware-baselines', 'ch32v203-pony', 'active.json'))).toBe(true)

    // Verify CourseService loaded from snapshot
    const studentCourseService = new CourseService({
      rootDir: join(outputDir, 'courses'),
      templatesRoot: join(outputDir, 'workspace-templates', 'ch32v203-mcu-lessons'),
      includeDrafts: false
    })

    const courses = await studentCourseService.listCourses()
    expect(courses).toHaveLength(1)
    expect(courses[0].lessonCount).toBe(1)

    const courseDetail = await studentCourseService.getCourse('ch32v203-foundations')
    expect(courseDetail.lessons).toHaveLength(1)
    expect(courseDetail.lessons[0].lessonId).toBe('first-program-on-chip')
    expect(courseDetail.lessons[0].status).toBe('published')
    expect(courseDetail.lessons[0].verification).toBe('hardware-checked')

    const spec = await studentCourseService.getWorkspaceCreationSpec('ch32v203-foundations', 'first-program-on-chip')
    expect(spec.templateVersion).toBe('content-v13')
    expect(spec.templateId).toBe('first-program-on-chip')
    expect(existsSync(join(spec.templateRoot, 'App', 'Src', 'experiment.c'))).toBe(true)

    await expect(studentCourseService.getLesson('ch32v203-foundations', 'gpio-output')).rejects.toThrow('COURSE_LESSON_NOT_FOUND')
  })
})
