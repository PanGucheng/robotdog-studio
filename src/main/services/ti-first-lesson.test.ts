import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CourseService } from './course-service'
import { exportPublishedSnapshot } from './published-snapshot'

const roots: string[] = []
const repo = process.cwd()
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('TI machine-horse first lesson', () => {
  it('loads the author lesson with real images and keeps unverified experiments out of the student course', async () => {
    const options = { rootDir: join(repo, 'resources/courses/ti-mspm0-foundations'), templatesRoot: join(repo, 'resources/workspace-templates') }
    const author = new CourseService({ ...options, includeDrafts: true })
    const lesson = await author.getLesson('ti-mspm0-gpio-foundations', 'gpio-sysconfig-toggle')
    expect(lesson).toMatchObject({ contentVersion: 4, status: 'draft', verification: 'pending-hardware-check' })
    expect(lesson.completionChecks.filter(check => check.type === 'manual-observation-confirmed').map(check => check.target)).toEqual(['observe-green', 'observe-slow-green', 'observe-led'])
    const lecture = await author.getLecture(lesson.courseId, lesson.lessonId)
    expect(lecture.status).toBe('ready')
    if (lecture.status !== 'ready') throw new Error('Missing lecture')
      expect(lecture.document.assets).toHaveLength(15)
    for (const image of lecture.document.assets) {
      const loaded = await author.getLectureAsset(lesson.courseId, lesson.lessonId, lecture.document.documentDigest, image.assetId)
      expect(Buffer.from(loaded.dataBase64, 'base64').byteLength).toBeGreaterThan(1000)
    }
    const student = new CourseService(options)
    expect((await student.getCourse(lesson.courseId)).lessons).toHaveLength(0)
    await expect(student.getLesson(lesson.courseId, lesson.lessonId)).rejects.toThrow('COURSE_LESSON_NOT_FOUND')
  })

  it('filters TI drafts, rejects unverified publication, and exports verified lessons with the actual lesson ID', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'ti-publication-fixture-'))
    roots.push(fixture)
    for (const directory of ['courses/ti-mspm0-foundations', 'workspace-templates/ti-mspm0g3507-foundations', 'firmware-baselines/ti-mspm0g3507']) {
      await cp(join(repo, 'resources', directory), join(fixture, 'resources', directory), { recursive: true })
    }
    const output = join(fixture, 'snapshot')
    const options = { editionId: 'ti-mspm0-foundations' as const, studioRoot: fixture, outputDir: output }
    const draft = exportPublishedSnapshot(options)
    expect(draft.publishedCourses).toEqual([])
    expect(draft.publishedTemplateIds).toEqual([])
    const target = join(output, 'courses/ti-mspm0-gpio-foundations')
    expect(existsSync(join(target, 'lessons/gpio-sysconfig-toggle.json'))).toBe(false)
    expect(existsSync(join(target, 'lectures/gpio-sysconfig-toggle'))).toBe(false)
    const file = join(fixture, 'resources/courses/ti-mspm0-foundations/ti-mspm0-gpio-foundations/lessons/gpio-sysconfig-toggle.json')
    const lesson = JSON.parse(await readFile(file, 'utf8'))
    lesson.status = 'published'
    await writeFile(file, JSON.stringify(lesson))
    expect(() => exportPublishedSnapshot(options)).toThrow('PUBLISHED_LESSON_HARDWARE_UNCHECKED:gpio-sysconfig-toggle')
    // This flag is modified only in the disposable fixture; it is not a hardware verification claim.
    lesson.verification = 'hardware-checked'
    await writeFile(file, JSON.stringify(lesson))
    const verified = exportPublishedSnapshot(options)
    expect(verified.publishedCourses).toEqual([{ courseId: 'ti-mspm0-gpio-foundations', publishedLessonIds: ['gpio-sysconfig-toggle'] }])
    expect(verified.publishedTemplateIds).toEqual(['ti-mspm0g3507-foundations'])
    expect(existsSync(join(target, 'lectures/gpio-sysconfig-toggle/assets/sysconfig-blue-settings.drawio.png'))).toBe(true)
    expect(existsSync(join(target, 'lectures/gpio-sysconfig-toggle/assets/sysconfig-overview.drawio.png'))).toBe(true)
  })
})
