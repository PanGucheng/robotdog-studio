import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EditionContentResolver } from './edition-content-resolver'
import { CourseService } from './course-service'
import { EditionContentUpdateService } from './edition-content-update-service'

const temporaryDirs: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `test-live-${prefix}-`))
  temporaryDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('Live Gitee Remote Content Update', () => {
  const staticRoot = join(process.cwd(), 'resources')

  it('Live Gitee verification: can fetch real update.json and download real MCU content package from Gitee', async () => {
    const userDataRoot = await createTempDir('live-mcu')
    const contentUserData = join(userDataRoot, 'content')
    const resolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: contentUserData,
      editionId: 'mcu-foundations'
    })

    const service = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations'
    })

    const status = await service.checkForUpdate()
    expect(['updated', 'up-to-date']).toContain(status.kind)
    expect(resolver.hasValidDownloadedContent()).toBe(true)
    expect(resolver.getCachedState()?.version).toBeGreaterThanOrEqual(1)

    // 1. Verify courses
    const courseService = new CourseService({
      rootDir: () => resolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const courses = await courseService.listCourses()
    expect(courses.length).toBeGreaterThan(0)
    expect(courses[0].courseId).toBe('ch32v203-foundations')

    // 2. Verify workspace-templates exist in downloaded content
    const templateRoot = resolver.resolveWorkspaceTemplateRoot()
    expect(existsSync(templateRoot)).toBe(true)

    // 3. Verify firmware-baselines exist in downloaded content
    const baselineRoot = resolver.resolveFirmwareBaselineRoot()
    expect(existsSync(baselineRoot)).toBe(true)
  }, 60000)

  it('Live Gitee verification: can fetch real update.json and download real TI MSPM0 content package from Gitee', async () => {
    const userDataRoot = await createTempDir('live-ti')
    const contentUserData = join(userDataRoot, 'content')
    const resolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: contentUserData,
      editionId: 'ti-mspm0-foundations'
    })

    const service = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver,
      appVersion: '0.1.0',
      editionId: 'ti-mspm0-foundations'
    })

    const status = await service.checkForUpdate()
    expect(['updated', 'up-to-date']).toContain(status.kind)
    expect(resolver.hasValidDownloadedContent()).toBe(true)
    expect(resolver.getCachedState()?.version).toBeGreaterThanOrEqual(1)

    // 1. Verify courses
    const courseService = new CourseService({
      rootDir: () => resolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const courses = await courseService.listCourses()
    expect(courses.length).toBeGreaterThan(0)
    expect(courses[0].courseId).toBe('ti-mspm0-gpio-foundations')

    // 2. Verify workspace-templates exist in downloaded content
    const templateRoot = resolver.resolveWorkspaceTemplateRoot()
    expect(existsSync(templateRoot)).toBe(true)

    // 3. Verify firmware-baselines exist in downloaded content
    const baselineRoot = resolver.resolveFirmwareBaselineRoot()
    expect(existsSync(baselineRoot)).toBe(true)
  }, 60000)

  it('Live Gitee verification: both MCU and TI content coexist in isolated directories', async () => {
    const userDataRoot = await createTempDir('live-coexist')
    const contentUserData = join(userDataRoot, 'content')

    // 1. Update MCU
    const mcuResolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: contentUserData,
      editionId: 'mcu-foundations'
    })
    const mcuService = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver: mcuResolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations'
    })
    const mcuStatus = await mcuService.checkForUpdate()
    expect(['updated', 'up-to-date']).toContain(mcuStatus.kind)
    expect(mcuResolver.hasValidDownloadedContent()).toBe(true)

    // 2. Update TI
    const tiResolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: contentUserData,
      editionId: 'ti-mspm0-foundations'
    })
    const tiService = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver: tiResolver,
      appVersion: '0.1.0',
      editionId: 'ti-mspm0-foundations'
    })
    const tiStatus = await tiService.checkForUpdate()
    expect(['updated', 'up-to-date']).toContain(tiStatus.kind)
    expect(tiResolver.hasValidDownloadedContent()).toBe(true)

    // 3. Verify MCU still intact and isolated
    expect(mcuResolver.hasValidDownloadedContent()).toBe(true)
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
  }, 80000)
})
