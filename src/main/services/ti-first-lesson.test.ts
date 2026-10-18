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
  it('opens the approved lesson and unchanged real images in the student course without claiming hardware verification', async () => {
    const options = { rootDir: join(repo, 'resources/courses/ti-mspm0-foundations'), templatesRoot: join(repo, 'resources/workspace-templates') }
    const author = new CourseService({ ...options, includeDrafts: true })
    const lesson = await author.getLesson('ti-mspm0-gpio-foundations', 'gpio-sysconfig-toggle')
    expect(lesson).toMatchObject({ contentVersion: 7, status: 'published', verification: 'author-approved', releaseApproval: { source: 'explicit-user-approval', date: '2026-10-17' } })
    expect(lesson.completionChecks.filter(check => check.type === 'manual-observation-confirmed').map(check => check.target)).toEqual(['observe-green', 'observe-slow-green', 'observe-led'])
    const lecture = await author.getLecture(lesson.courseId, lesson.lessonId)
    expect(lecture.status).toBe('ready')
    if (lecture.status !== 'ready') throw new Error('Missing lecture')
    expect(lecture.document.assets).toHaveLength(16)
    for (const image of lecture.document.assets) {
      const loaded = await author.getLectureAsset(lesson.courseId, lesson.lessonId, lecture.document.documentDigest, image.assetId)
      expect(Buffer.from(loaded.dataBase64, 'base64').byteLength).toBeGreaterThan(1000)
    }
    const student = new CourseService(options)
    expect((await student.getCourse(lesson.courseId)).lessons).toHaveLength(1)
    await expect(student.getLesson(lesson.courseId, lesson.lessonId)).resolves.toMatchObject({ verification: 'author-approved' })
    expect((await student.getLecture(lesson.courseId, lesson.lessonId)).status).toBe('ready')
    const spec = await student.getWorkspaceCreationSpec(lesson.courseId, lesson.lessonId)
    expect(spec).toMatchObject({ templateId: 'ti-mspm0g3507-foundations', templateVersion: 'content-v7' })
    const context = await student.buildAiContext(lesson.courseId, lesson.lessonId, 'summary')
    expect(context).toContain('author-approved')
    expect(context).toContain('不得声称已观察到现象')
  })

  it('exports approved TI content, filters drafts and rejects missing approval or pending hardware status', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'ti-publication-fixture-'))
    roots.push(fixture)
    for (const directory of ['courses/ti-mspm0-foundations', ...['ti-mspm0g3507-foundations', 'ti-mspm0g3507-sdk-empty', 'ti-mspm0g3507-pony'].map(id => `workspace-templates/${id}`), ...['ti-mspm0g3507', 'ti-mspm0g3507-sdk-empty', 'ti-mspm0g3507-pony'].map(id => `firmware-baselines/${id}`)]) {
      await cp(join(repo, 'resources', directory), join(fixture, 'resources', directory), { recursive: true })
    }
    const output = join(fixture, 'snapshot')
    const options = { editionId: 'ti-mspm0-foundations' as const, studioRoot: fixture, outputDir: output }
    const approved = exportPublishedSnapshot(options)
    expect(approved.publishedCourses).toEqual([{ courseId: 'ti-mspm0-gpio-foundations', publishedLessonIds: ['gpio-sysconfig-toggle'] }])
    expect(approved.publishedTemplateIds).toEqual(['ti-mspm0g3507-foundations'])
    for (const id of ['ti-mspm0g3507-sdk-empty', 'ti-mspm0g3507-pony']) {
      expect(existsSync(join(output, 'workspace-templates', id, 'src/main.c'))).toBe(true)
      expect(existsSync(join(output, 'firmware-baselines', id, 'active.json'))).toBe(true)
      expect(existsSync(join(output, 'firmware-baselines', id, 'current/source/board.syscfg'))).toBe(true)
    }
    const target = join(output, 'courses/ti-mspm0-gpio-foundations')
    expect(existsSync(join(target, 'lectures/gpio-sysconfig-toggle/assets/sysconfig-blue-settings.drawio.png'))).toBe(true)
    expect(existsSync(join(target, 'lectures/gpio-sysconfig-toggle/assets/sysconfig-overview.drawio.png'))).toBe(true)
    const file = join(fixture, 'resources/courses/ti-mspm0-foundations/ti-mspm0-gpio-foundations/lessons/gpio-sysconfig-toggle.json')
    const lesson = JSON.parse(await readFile(file, 'utf8'))
    delete lesson.releaseApproval
    await writeFile(file, JSON.stringify(lesson))
    expect(() => exportPublishedSnapshot(options)).toThrow('PUBLISHED_LESSON_HARDWARE_UNCHECKED:gpio-sysconfig-toggle')
    lesson.status = 'draft'
    lesson.verification = 'pending-hardware-check'
    await writeFile(file, JSON.stringify(lesson))
    const draft = exportPublishedSnapshot(options)
    expect(draft.publishedCourses).toEqual([])
    expect(draft.publishedTemplateIds).toEqual([])
    expect(existsSync(join(target, 'lessons/gpio-sysconfig-toggle.json'))).toBe(false)
    expect(existsSync(join(target, 'lectures/gpio-sysconfig-toggle'))).toBe(false)
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
