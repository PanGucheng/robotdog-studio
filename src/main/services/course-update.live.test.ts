import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CourseResolver } from './course-resolver'
import { CourseService } from './course-service'
import { CourseUpdateService } from './course-update-service'

const temporaryDirs: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `test-${prefix}-`))
  temporaryDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('Live Gitee Remote Course Update', () => {
  const mcuBundledRoot = join(process.cwd(), 'resources', 'courses', 'mcu-foundations')
  const tiBundledRoot = join(process.cwd(), 'resources', 'courses', 'ti-mspm0-foundations')

  it('Live Gitee verification: can fetch real update.json and download real MCU course from Gitee', async () => {
    const userDataRoot = await createTempDir('live-mcu')
    const coursesUserData = join(userDataRoot, 'courses')
    const resolver = new CourseResolver({
      bundledRoot: mcuBundledRoot,
      userDataCoursesRoot: coursesUserData,
      editionId: 'mcu-foundations'
    })

    const service = new CourseUpdateService({
      userDataCoursesRoot: coursesUserData,
      resolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations'
    })

    const status = await service.checkForUpdate()
    expect(['updated', 'up-to-date']).toContain(status.kind)
    expect(resolver.hasValidDownloadedCourse()).toBe(true)
    expect(resolver.getCachedState()?.version).toBeGreaterThanOrEqual(1)

    const courseService = new CourseService({
      rootDir: () => resolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const courses = await courseService.listCourses()
    expect(courses.length).toBeGreaterThan(0)
    expect(courses[0].courseId).toBe('ch32v203-foundations')
  }, 45000)

  it('Live Gitee verification: can fetch real update.json and download real TI MSPM0 course from Gitee', async () => {
    const userDataRoot = await createTempDir('live-ti')
    const coursesUserData = join(userDataRoot, 'courses')
    const resolver = new CourseResolver({
      bundledRoot: tiBundledRoot,
      userDataCoursesRoot: coursesUserData,
      editionId: 'ti-mspm0-foundations'
    })

    const service = new CourseUpdateService({
      userDataCoursesRoot: coursesUserData,
      resolver,
      appVersion: '0.1.0',
      editionId: 'ti-mspm0-foundations'
    })

    const status = await service.checkForUpdate()
    expect(['updated', 'up-to-date']).toContain(status.kind)
    expect(resolver.hasValidDownloadedCourse()).toBe(true)
    expect(resolver.getCachedState()?.version).toBeGreaterThanOrEqual(1)

    const courseService = new CourseService({
      rootDir: () => resolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const courses = await courseService.listCourses()
    expect(courses.length).toBeGreaterThan(0)
    expect(courses[0].courseId).toBe('ti-mspm0-gpio-foundations')
  }, 45000)

  it('Live Gitee verification: both MCU and TI courses coexist in isolated directories', async () => {
    const userDataRoot = await createTempDir('live-coexist')
    const coursesUserData = join(userDataRoot, 'courses')

    // 1. Update MCU
    const mcuResolver = new CourseResolver({
      bundledRoot: mcuBundledRoot,
      userDataCoursesRoot: coursesUserData,
      editionId: 'mcu-foundations'
    })
    const mcuService = new CourseUpdateService({
      userDataCoursesRoot: coursesUserData,
      resolver: mcuResolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations'
    })
    const mcuStatus = await mcuService.checkForUpdate()
    expect(['updated', 'up-to-date']).toContain(mcuStatus.kind)
    expect(mcuResolver.hasValidDownloadedCourse()).toBe(true)

    // 2. Update TI
    const tiResolver = new CourseResolver({
      bundledRoot: tiBundledRoot,
      userDataCoursesRoot: coursesUserData,
      editionId: 'ti-mspm0-foundations'
    })
    const tiService = new CourseUpdateService({
      userDataCoursesRoot: coursesUserData,
      resolver: tiResolver,
      appVersion: '0.1.0',
      editionId: 'ti-mspm0-foundations'
    })
    const tiStatus = await tiService.checkForUpdate()
    expect(['updated', 'up-to-date']).toContain(tiStatus.kind)
    expect(tiResolver.hasValidDownloadedCourse()).toBe(true)

    // 3. Verify MCU still intact and isolated
    expect(mcuResolver.hasValidDownloadedCourse()).toBe(true)
    const mcuCourseService = new CourseService({
      rootDir: () => mcuResolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const mcuCourses = await mcuCourseService.listCourses()
    expect(mcuCourses.length).toBeGreaterThan(0)
    expect(mcuCourses[0].courseId).toBe('ch32v203-foundations')

    // 4. Verify TI intact and isolated
    const tiCourseService = new CourseService({
      rootDir: () => tiResolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const tiCourses = await tiCourseService.listCourses()
    expect(tiCourses.length).toBeGreaterThan(0)
    expect(tiCourses[0].courseId).toBe('ti-mspm0-gpio-foundations')
  }, 60000)
})
