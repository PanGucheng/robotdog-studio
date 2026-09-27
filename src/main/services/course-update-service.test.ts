import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { CourseResolver } from './course-resolver'
import { CourseService } from './course-service'
import { CourseUpdateService, isAppVersionCompatible } from './course-update-service'

const execFileAsync = promisify(execFile)

const temporaryDirs: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `test-${prefix}-`))
  temporaryDirs.push(dir)
  return dir
}

async function createTestCourseZip(
  zipPath: string,
  catalogCourses: Array<{ courseId: string; manifest: string }>,
  courseMeta?: { courseId: string; title?: string }
): Promise<void> {
  const staging = await createTempDir('zip-stage')
  await writeFile(
    join(staging, 'catalog.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        courses: catalogCourses
      },
      null,
      2
    ),
    'utf8'
  )

  const courseId = courseMeta?.courseId ?? catalogCourses[0]?.courseId ?? 'ch32v203-foundations'
  const courseTitle = courseMeta?.title ?? '测试远程课程'

  await mkdir(join(staging, courseId, 'lessons'), { recursive: true })
  await mkdir(join(staging, courseId, 'lectures', 'lesson-one'), { recursive: true })
  await writeFile(
    join(staging, courseId, 'course.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        courseId,
        contentVersion: 10,
        title: courseTitle,
        summary: '远程下载的测试课程',
        audience: '测试学生',
        objectives: ['远程目标1'],
        status: 'published',
        boardScope: courseId.startsWith('ti') ? 'MSPM0G3507' : 'CH32V203',
        lessonOrder: ['lesson-one'],
        sourceAttribution: ['测试机构']
      },
      null,
      2
    ),
    'utf8'
  )

  await writeFile(
    join(staging, courseId, 'lessons', 'lesson-one.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        courseId,
        lessonId: 'lesson-one',
        title: '第一课测试',
        summary: '测试课时',
        objectives: ['目标1'],
        prerequisites: [],
        estimatedMinutes: 30,
        hardware: 'optional',
        verification: 'not-required',
        expectedObservation: '观察到测试现象',
        templateId: 'first-program-on-chip',
        editableGlobs: ['App/Src/experiment.c'],
        readableFiles: [],
        deniedGlobs: [],
        steps: [{ stepId: 'step-1', type: 'read', title: '步骤1', instruction: '阅读说明' }],
        completionChecks: [],
        reflectionQuestions: [],
        aiContext: { teachingFocus: '测试焦点', hints: ['提示1'] },
        status: 'published'
      },
      null,
      2
    ),
    'utf8'
  )

  try {
    await execFileAsync('tar.exe', ['-a', '-c', '-f', zipPath, '-C', staging, '.'])
  } catch {
    const cmd = `Compress-Archive -Path '${staging}\\*' -DestinationPath '${zipPath}' -Force`
    await execFileAsync('powershell', ['-NoProfile', '-Command', cmd])
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('CourseUpdateService and CourseResolver', () => {
  const mcuBundledRoot = join(process.cwd(), 'resources', 'courses', 'mcu-foundations')
  const tiBundledRoot = join(process.cwd(), 'resources', 'courses', 'ti-mspm0-foundations')

  describe('MCU Foundations (mcu-foundations)', () => {
    it('Test 1: 无远程缓存 -> 优先且正常加载安装包自带课程', async () => {
      const userDataRoot = await createTempDir('user-data-1')
      const coursesUserData = join(userDataRoot, 'courses')
      const resolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      expect(resolver.hasValidDownloadedCourse()).toBe(false)
      expect(resolver.resolveCourseRoot()).toBe(mcuBundledRoot)

      const courseService = new CourseService({
        rootDir: () => resolver.resolveCourseRoot(),
        includeDrafts: true
      })

      const courses = await courseService.listCourses()
      expect(courses.length).toBeGreaterThan(0)
      expect(courses[0].courseId).toBe('ch32v203-foundations')
    })

    it('Test 2: 发现新版本 -> 成功下载、解压、更新版本号并加载新版课程', async () => {
      const userDataRoot = await createTempDir('user-data-2')
      const coursesUserData = join(userDataRoot, 'courses')
      const resolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      const zipFile = join(await createTempDir('remote-zip'), 'course.zip')
      await createTestCourseZip(
        zipFile,
        [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }],
        { courseId: 'ch32v203-foundations', title: '测试MCU远程新版课程' }
      )
      const zipBytes = await readFile(zipFile)

      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'mcu-foundations': {
                  version: 2,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/mcu-foundations/course.zip'
                }
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        }
        if (url.includes('course.zip')) {
          return new Response(zipBytes, {
            status: 200,
            headers: { 'Content-Type': 'application/zip' }
          })
        }
        return new Response('Not found', { status: 404 })
      }

      let notifiedNewRoot: string | undefined
      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '0.1.0',
        editionId: 'mcu-foundations',
        fetchFn: mockFetch,
        onCourseUpdated: (newRoot) => {
          notifiedNewRoot = newRoot
        }
      })

      expect(service.getLocalVersion()).toBe(0)
      const status = await service.checkForUpdate()
      expect(status.kind).toBe('updated')
      expect(status.currentVersion).toBe(2)
      expect(status.message).toBe('课程更新完成')
      expect(notifiedNewRoot).toBe(resolver.getCurrentDir('mcu-foundations'))

      expect(resolver.hasValidDownloadedCourse()).toBe(true)
      expect(resolver.resolveCourseRoot()).toBe(resolver.getCurrentDir('mcu-foundations'))
      expect(resolver.getCachedState()?.version).toBe(2)

      const courseService = new CourseService({
        rootDir: () => resolver.resolveCourseRoot(),
        includeDrafts: true
      })
      const courses = await courseService.listCourses()
      expect(courses).toHaveLength(1)
      expect(courses[0].courseId).toBe('ch32v203-foundations')
      expect(courses[0].title).toBe('测试MCU远程新版课程')
    })

    it('Test 3: 版本一致 -> 不重复下载 course.zip', async () => {
      const userDataRoot = await createTempDir('user-data-3')
      const coursesUserData = join(userDataRoot, 'courses')
      const mcuDir = join(coursesUserData, 'mcu-foundations')
      await mkdir(mcuDir, { recursive: true })
      await writeFile(join(mcuDir, 'state.json'), JSON.stringify({ version: 2 }), 'utf8')

      const resolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      let zipRequested = false
      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'mcu-foundations': {
                  version: 2,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/mcu-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('course.zip')) {
          zipRequested = true
          return new Response('should not be called', { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '0.1.0',
        editionId: 'mcu-foundations',
        fetchFn: mockFetch
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('up-to-date')
      expect(status.message).toBe('课程已是最新版本')
      expect(status.currentVersion).toBe(2)
      expect(zipRequested).toBe(false)
    })

    it('Test 4: Gitee 无网络 (超时/DNS错误) -> 状态为错误，非阻塞且保留现有课程', async () => {
      const userDataRoot = await createTempDir('user-data-4')
      const coursesUserData = join(userDataRoot, 'courses')
      const resolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      const mockFetch: typeof fetch = async () => {
        throw new Error('fetch failed: getaddrinfo ENOTFOUND gitee.com')
      }

      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '0.1.0',
        editionId: 'mcu-foundations',
        fetchFn: mockFetch
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('error')
      expect(status.message).toBe('课程更新失败，继续使用当前版本')
      expect(resolver.resolveCourseRoot()).toBe(mcuBundledRoot)
    })

    it('Test 5: 下载中断 / 网络报错 -> 旧课程仍然存在且未损坏', async () => {
      const userDataRoot = await createTempDir('user-data-5')
      const coursesUserData = join(userDataRoot, 'courses')
      const currentDir = join(coursesUserData, 'mcu-foundations', 'current')
      await mkdir(currentDir, { recursive: true })
      await writeFile(
        join(currentDir, 'catalog.json'),
        JSON.stringify({
          schemaVersion: 1,
          courses: [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }]
        }),
        'utf8'
      )
      await writeFile(
        join(coursesUserData, 'mcu-foundations', 'state.json'),
        JSON.stringify({ version: 1 }),
        'utf8'
      )

      const resolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'mcu-foundations': {
                  version: 2,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/mcu-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('course.zip')) {
          return new Response('Server Error', { status: 500 })
        }
        return new Response('Not found', { status: 404 })
      }

      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '0.1.0',
        editionId: 'mcu-foundations',
        fetchFn: mockFetch
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('error')
      expect(status.message).toBe('课程更新失败，继续使用当前版本')

      expect(resolver.hasValidDownloadedCourse()).toBe(true)
      const catalog = JSON.parse(await readFile(join(currentDir, 'catalog.json'), 'utf8'))
      expect(catalog.courses[0].courseId).toBe('ch32v203-foundations')
      expect(resolver.getCachedState()?.version).toBe(1)
    })

    it('Test 6: ZIP 损坏 -> 拒绝替换 current，继续使用旧课程', async () => {
      const userDataRoot = await createTempDir('user-data-6')
      const coursesUserData = join(userDataRoot, 'courses')
      const currentDir = join(coursesUserData, 'mcu-foundations', 'current')
      await mkdir(currentDir, { recursive: true })
      await writeFile(
        join(currentDir, 'catalog.json'),
        JSON.stringify({
          schemaVersion: 1,
          courses: [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }]
        }),
        'utf8'
      )
      await writeFile(
        join(coursesUserData, 'mcu-foundations', 'state.json'),
        JSON.stringify({ version: 1 }),
        'utf8'
      )

      const resolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'mcu-foundations': {
                  version: 2,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/mcu-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('course.zip')) {
          return new Response(Buffer.from('not a valid zip file content'), { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '0.1.0',
        editionId: 'mcu-foundations',
        fetchFn: mockFetch
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('error')
      expect(status.message).toBe('课程更新失败，继续使用当前版本')

      expect(resolver.hasValidDownloadedCourse()).toBe(true)
      const catalog = JSON.parse(await readFile(join(currentDir, 'catalog.json'), 'utf8'))
      expect(catalog.courses[0].courseId).toBe('ch32v203-foundations')
    })

    it('Test 7: 应用重启 -> 再次启动直接读取最新缓存课程', async () => {
      const userDataRoot = await createTempDir('user-data-7')
      const coursesUserData = join(userDataRoot, 'courses')
      const currentDir = join(coursesUserData, 'mcu-foundations', 'current')

      await mkdir(currentDir, { recursive: true })
      await writeFile(
        join(currentDir, 'catalog.json'),
        JSON.stringify({
          schemaVersion: 1,
          courses: [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }]
        }),
        'utf8'
      )
      await writeFile(
        join(coursesUserData, 'mcu-foundations', 'state.json'),
        JSON.stringify({ version: 5 }),
        'utf8'
      )

      const newResolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      expect(newResolver.hasValidDownloadedCourse()).toBe(true)
      expect(newResolver.resolveCourseRoot()).toBe(currentDir)
      expect(newResolver.getCachedState()?.version).toBe(5)
    })

    it('Test 8: 软件版本不兼容 -> minAppVersion > 当前版本，不下载，继续使用当前版本', async () => {
      const userDataRoot = await createTempDir('user-data-8')
      const coursesUserData = join(userDataRoot, 'courses')
      const resolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      let zipRequested = false
      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'mcu-foundations': {
                  version: 2,
                  minAppVersion: '2.0.0',
                  url: 'https://fake-server/courses/mcu-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('course.zip')) {
          zipRequested = true
          return new Response('zip', { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '1.0.0',
        editionId: 'mcu-foundations',
        fetchFn: mockFetch
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('incompatible')
      expect(status.message).toBe('新版课程需要更新软件后使用')
      expect(status.minAppVersion).toBe('2.0.0')
      expect(zipRequested).toBe(false)
    })

    it('Test 9: 兼容 V1 update.json -> schemaVersion 1 根字段在 mcu-foundations 下平滑兼容', async () => {
      const userDataRoot = await createTempDir('user-data-9')
      const coursesUserData = join(userDataRoot, 'courses')
      const resolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      const zipFile = join(await createTempDir('remote-zip-v1'), 'course.zip')
      await createTestCourseZip(
        zipFile,
        [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }],
        { courseId: 'ch32v203-foundations', title: '兼容V1的MCU课程' }
      )
      const zipBytes = await readFile(zipFile)

      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              version: 3,
              minAppVersion: '0.1.0',
              url: 'https://fake-server/course.zip'
            }),
            { status: 200 }
          )
        }
        if (url.endsWith('course.zip')) {
          return new Response(zipBytes, { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '0.1.0',
        editionId: 'mcu-foundations',
        fetchFn: mockFetch
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('updated')
      expect(status.currentVersion).toBe(3)
      expect(resolver.hasValidDownloadedCourse()).toBe(true)
      expect(resolver.getCachedState()?.version).toBe(3)
    })

    it('Test 10: 遗留缓存迁移 -> legacy courses/current 自动迁移到 courses/mcu-foundations/current', async () => {
      const userDataRoot = await createTempDir('user-data-10')
      const coursesUserData = join(userDataRoot, 'courses')
      const legacyCurrent = join(coursesUserData, 'current')
      const legacyState = join(coursesUserData, 'state.json')

      await mkdir(legacyCurrent, { recursive: true })
      await writeFile(
        join(legacyCurrent, 'catalog.json'),
        JSON.stringify({
          schemaVersion: 1,
          courses: [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }]
        }),
        'utf8'
      )
      await writeFile(legacyState, JSON.stringify({ version: 9 }), 'utf8')

      const resolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      const targetCurrent = join(coursesUserData, 'mcu-foundations', 'current')
      expect(existsSync(targetCurrent)).toBe(true)
      expect(existsSync(legacyCurrent)).toBe(false)
      expect(resolver.hasValidDownloadedCourse()).toBe(true)
      expect(resolver.getCachedState()?.version).toBe(9)
      expect(resolver.resolveCourseRoot()).toBe(targetCurrent)
    })
  })

  describe('TI MSPM0 Foundations (ti-mspm0-foundations)', () => {
    it('Test 11: TI MSPM0 无远程缓存 -> 优先加载自带 TI 课程', async () => {
      const userDataRoot = await createTempDir('user-data-ti-11')
      const coursesUserData = join(userDataRoot, 'courses')
      const resolver = new CourseResolver({
        bundledRoot: tiBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'ti-mspm0-foundations'
      })

      expect(resolver.hasValidDownloadedCourse()).toBe(false)
      expect(resolver.resolveCourseRoot()).toBe(tiBundledRoot)

      const courseService = new CourseService({
        rootDir: () => resolver.resolveCourseRoot(),
        includeDrafts: true
      })

      const courses = await courseService.listCourses()
      expect(courses.length).toBeGreaterThan(0)
      expect(courses[0].courseId).toBe('ti-mspm0-gpio-foundations')
    })

    it('Test 12: TI MSPM0 发现新版本 -> 成功下载解压并加载新版 TI 课程', async () => {
      const userDataRoot = await createTempDir('user-data-ti-12')
      const coursesUserData = join(userDataRoot, 'courses')
      const resolver = new CourseResolver({
        bundledRoot: tiBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'ti-mspm0-foundations'
      })

      const zipFile = join(await createTempDir('remote-zip-ti'), 'course.zip')
      await createTestCourseZip(
        zipFile,
        [{ courseId: 'ti-mspm0-gpio-foundations', manifest: 'ti-mspm0-gpio-foundations/course.json' }],
        { courseId: 'ti-mspm0-gpio-foundations', title: '测试TI MSPM0远程新版课程' }
      )
      const zipBytes = await readFile(zipFile)

      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'ti-mspm0-foundations': {
                  version: 2,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/ti-mspm0-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('course.zip')) {
          return new Response(zipBytes, { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      let notifiedNewRoot: string | undefined
      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '0.1.0',
        editionId: 'ti-mspm0-foundations',
        fetchFn: mockFetch,
        onCourseUpdated: (newRoot) => {
          notifiedNewRoot = newRoot
        }
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('updated')
      expect(status.currentVersion).toBe(2)
      expect(notifiedNewRoot).toBe(resolver.getCurrentDir('ti-mspm0-foundations'))

      expect(resolver.hasValidDownloadedCourse()).toBe(true)
      expect(resolver.resolveCourseRoot()).toBe(resolver.getCurrentDir('ti-mspm0-foundations'))

      const courseService = new CourseService({
        rootDir: () => resolver.resolveCourseRoot(),
        includeDrafts: true
      })
      const courses = await courseService.listCourses()
      expect(courses).toHaveLength(1)
      expect(courses[0].courseId).toBe('ti-mspm0-gpio-foundations')
      expect(courses[0].title).toBe('测试TI MSPM0远程新版课程')
    })

    it('Test 13: TI MSPM0 版本一致 -> 不重复下载', async () => {
      const userDataRoot = await createTempDir('user-data-ti-13')
      const coursesUserData = join(userDataRoot, 'courses')
      const tiDir = join(coursesUserData, 'ti-mspm0-foundations')
      await mkdir(tiDir, { recursive: true })
      await writeFile(join(tiDir, 'state.json'), JSON.stringify({ version: 2 }), 'utf8')

      const resolver = new CourseResolver({
        bundledRoot: tiBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'ti-mspm0-foundations'
      })

      let zipRequested = false
      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'ti-mspm0-foundations': {
                  version: 2,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/ti-mspm0-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('course.zip')) {
          zipRequested = true
          return new Response('zip', { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '0.1.0',
        editionId: 'ti-mspm0-foundations',
        fetchFn: mockFetch
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('up-to-date')
      expect(status.currentVersion).toBe(2)
      expect(zipRequested).toBe(false)
    })

    it('Test 14: TI MSPM0 网络错误 -> 优雅降级，保留当前课程', async () => {
      const userDataRoot = await createTempDir('user-data-ti-14')
      const coursesUserData = join(userDataRoot, 'courses')
      const resolver = new CourseResolver({
        bundledRoot: tiBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'ti-mspm0-foundations'
      })

      const mockFetch: typeof fetch = async () => {
        throw new Error('network down')
      }

      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '0.1.0',
        editionId: 'ti-mspm0-foundations',
        fetchFn: mockFetch
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('error')
      expect(resolver.resolveCourseRoot()).toBe(tiBundledRoot)
    })

    it('Test 15: TI MSPM0 ZIP 损坏 -> 拒绝替换，保留旧课程', async () => {
      const userDataRoot = await createTempDir('user-data-ti-15')
      const coursesUserData = join(userDataRoot, 'courses')
      const currentDir = join(coursesUserData, 'ti-mspm0-foundations', 'current')
      await mkdir(currentDir, { recursive: true })
      await writeFile(
        join(currentDir, 'catalog.json'),
        JSON.stringify({
          schemaVersion: 1,
          courses: [{ courseId: 'ti-mspm0-gpio-foundations', manifest: 'ti-mspm0-gpio-foundations/course.json' }]
        }),
        'utf8'
      )
      await writeFile(
        join(coursesUserData, 'ti-mspm0-foundations', 'state.json'),
        JSON.stringify({ version: 1 }),
        'utf8'
      )

      const resolver = new CourseResolver({
        bundledRoot: tiBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'ti-mspm0-foundations'
      })

      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'ti-mspm0-foundations': {
                  version: 2,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/ti-mspm0-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('course.zip')) {
          return new Response(Buffer.from('corrupt content'), { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '0.1.0',
        editionId: 'ti-mspm0-foundations',
        fetchFn: mockFetch
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('error')
      expect(resolver.hasValidDownloadedCourse()).toBe(true)
      expect(resolver.getCachedState()?.version).toBe(1)
    })

    it('Test 16: TI MSPM0 应用重启 -> 启动直接加载已缓存课程', async () => {
      const userDataRoot = await createTempDir('user-data-ti-16')
      const coursesUserData = join(userDataRoot, 'courses')
      const currentDir = join(coursesUserData, 'ti-mspm0-foundations', 'current')

      await mkdir(currentDir, { recursive: true })
      await writeFile(
        join(currentDir, 'catalog.json'),
        JSON.stringify({
          schemaVersion: 1,
          courses: [{ courseId: 'ti-mspm0-gpio-foundations', manifest: 'ti-mspm0-gpio-foundations/course.json' }]
        }),
        'utf8'
      )
      await writeFile(
        join(coursesUserData, 'ti-mspm0-foundations', 'state.json'),
        JSON.stringify({ version: 7 }),
        'utf8'
      )

      const newResolver = new CourseResolver({
        bundledRoot: tiBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'ti-mspm0-foundations'
      })

      expect(newResolver.hasValidDownloadedCourse()).toBe(true)
      expect(newResolver.resolveCourseRoot()).toBe(currentDir)
      expect(newResolver.getCachedState()?.version).toBe(7)
    })

    it('Test 17: TI MSPM0 软件版本不兼容 -> minAppVersion 过高跳过更新', async () => {
      const userDataRoot = await createTempDir('user-data-ti-17')
      const coursesUserData = join(userDataRoot, 'courses')
      const resolver = new CourseResolver({
        bundledRoot: tiBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'ti-mspm0-foundations'
      })

      let zipRequested = false
      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'ti-mspm0-foundations': {
                  version: 3,
                  minAppVersion: '3.0.0',
                  url: 'https://fake-server/courses/ti-mspm0-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('course.zip')) {
          zipRequested = true
          return new Response('zip', { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      const service = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver,
        appVersion: '1.0.0',
        editionId: 'ti-mspm0-foundations',
        fetchFn: mockFetch
      })

      const status = await service.checkForUpdate()
      expect(status.kind).toBe('incompatible')
      expect(status.minAppVersion).toBe('3.0.0')
      expect(zipRequested).toBe(false)
    })
  })

  describe('Multi-edition Isolation and Safety', () => {
    it('Test 18: 多版本隔离: 更新 MCU 课程绝不影响 TI 课程缓存', async () => {
      const userDataRoot = await createTempDir('user-data-iso-18')
      const coursesUserData = join(userDataRoot, 'courses')

      // Pre-seed TI cache
      const tiDir = join(coursesUserData, 'ti-mspm0-foundations')
      const tiCurrent = join(tiDir, 'current')
      await mkdir(tiCurrent, { recursive: true })
      await writeFile(
        join(tiCurrent, 'catalog.json'),
        JSON.stringify({
          schemaVersion: 1,
          courses: [{ courseId: 'ti-mspm0-gpio-foundations', manifest: 'ti-mspm0-gpio-foundations/course.json' }]
        }),
        'utf8'
      )
      await writeFile(join(tiDir, 'state.json'), JSON.stringify({ version: 3 }), 'utf8')

      // Update MCU course
      const mcuResolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })

      const zipFile = join(await createTempDir('remote-zip-mcu'), 'course.zip')
      await createTestCourseZip(
        zipFile,
        [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }],
        { courseId: 'ch32v203-foundations', title: 'MCU新版' }
      )
      const zipBytes = await readFile(zipFile)

      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'mcu-foundations': {
                  version: 5,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/mcu-foundations/course.zip'
                },
                'ti-mspm0-foundations': {
                  version: 3,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/ti-mspm0-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('courses/mcu-foundations/course.zip')) {
          return new Response(zipBytes, { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      const mcuService = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver: mcuResolver,
        appVersion: '0.1.0',
        editionId: 'mcu-foundations',
        fetchFn: mockFetch
      })

      const status = await mcuService.checkForUpdate()
      expect(status.kind).toBe('updated')
      expect(status.currentVersion).toBe(5)

      // Verify TI cache remains untouched
      const tiResolver = new CourseResolver({
        bundledRoot: tiBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'ti-mspm0-foundations'
      })
      expect(tiResolver.hasValidDownloadedCourse()).toBe(true)
      expect(tiResolver.getCachedState()?.version).toBe(3)
      const tiCatalog = JSON.parse(await readFile(join(tiCurrent, 'catalog.json'), 'utf8'))
      expect(tiCatalog.courses[0].courseId).toBe('ti-mspm0-gpio-foundations')
    })

    it('Test 19: 多版本隔离: 更新 TI 课程绝不影响 MCU 课程缓存', async () => {
      const userDataRoot = await createTempDir('user-data-iso-19')
      const coursesUserData = join(userDataRoot, 'courses')

      // Pre-seed MCU cache
      const mcuDir = join(coursesUserData, 'mcu-foundations')
      const mcuCurrent = join(mcuDir, 'current')
      await mkdir(mcuCurrent, { recursive: true })
      await writeFile(
        join(mcuCurrent, 'catalog.json'),
        JSON.stringify({
          schemaVersion: 1,
          courses: [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }]
        }),
        'utf8'
      )
      await writeFile(join(mcuDir, 'state.json'), JSON.stringify({ version: 2 }), 'utf8')

      // Update TI course
      const tiResolver = new CourseResolver({
        bundledRoot: tiBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'ti-mspm0-foundations'
      })

      const zipFile = join(await createTempDir('remote-zip-ti-19'), 'course.zip')
      await createTestCourseZip(
        zipFile,
        [{ courseId: 'ti-mspm0-gpio-foundations', manifest: 'ti-mspm0-gpio-foundations/course.json' }],
        { courseId: 'ti-mspm0-gpio-foundations', title: 'TI新版' }
      )
      const zipBytes = await readFile(zipFile)

      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'mcu-foundations': {
                  version: 2,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/mcu-foundations/course.zip'
                },
                'ti-mspm0-foundations': {
                  version: 4,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/ti-mspm0-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('courses/ti-mspm0-foundations/course.zip')) {
          return new Response(zipBytes, { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      const tiService = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver: tiResolver,
        appVersion: '0.1.0',
        editionId: 'ti-mspm0-foundations',
        fetchFn: mockFetch
      })

      const status = await tiService.checkForUpdate()
      expect(status.kind).toBe('updated')
      expect(status.currentVersion).toBe(4)

      // Verify MCU cache remains untouched
      const mcuResolver = new CourseResolver({
        bundledRoot: mcuBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'mcu-foundations'
      })
      expect(mcuResolver.hasValidDownloadedCourse()).toBe(true)
      expect(mcuResolver.getCachedState()?.version).toBe(2)
      const mcuCatalog = JSON.parse(await readFile(join(mcuCurrent, 'catalog.json'), 'utf8'))
      expect(mcuCatalog.courses[0].courseId).toBe('ch32v203-foundations')
    })

    it('Test 20: 跨版本包校验防护: 如果远端下发错误的课程包(如 TI 版拿到 MCU 包)，校验失败并拒绝应用', async () => {
      const userDataRoot = await createTempDir('user-data-cross-20')
      const coursesUserData = join(userDataRoot, 'courses')
      const tiResolver = new CourseResolver({
        bundledRoot: tiBundledRoot,
        userDataCoursesRoot: coursesUserData,
        editionId: 'ti-mspm0-foundations'
      })

      // Create an MCU package (starts with ch32)
      const wrongZip = join(await createTempDir('remote-wrong-zip'), 'course.zip')
      await createTestCourseZip(
        wrongZip,
        [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }],
        { courseId: 'ch32v203-foundations', title: '错误的MCU包发给了TI' }
      )
      const wrongZipBytes = await readFile(wrongZip)

      const mockFetch: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('update.json')) {
          return new Response(
            JSON.stringify({
              schemaVersion: 2,
              editions: {
                'ti-mspm0-foundations': {
                  version: 5,
                  minAppVersion: '0.1.0',
                  url: 'https://fake-server/courses/ti-mspm0-foundations/course.zip'
                }
              }
            }),
            { status: 200 }
          )
        }
        if (url.includes('course.zip')) {
          return new Response(wrongZipBytes, { status: 200 })
        }
        return new Response('Not found', { status: 404 })
      }

      const tiService = new CourseUpdateService({
        userDataCoursesRoot: coursesUserData,
        resolver: tiResolver,
        appVersion: '0.1.0',
        editionId: 'ti-mspm0-foundations',
        fetchFn: mockFetch
      })

      const status = await tiService.checkForUpdate()
      expect(status.kind).toBe('error')
      expect(status.message).toBe('课程更新失败，继续使用当前版本')

      // TI current directory must not exist or be polluted
      expect(tiResolver.hasValidDownloadedCourse()).toBe(false)
      expect(tiResolver.resolveCourseRoot()).toBe(tiBundledRoot)
    })
  })

  describe('App Version Compatibility Helper', () => {
    it('helper: isAppVersionCompatible accurately compares semantic versions', () => {
      expect(isAppVersionCompatible('1.0.0', '1.0.0')).toBe(true)
      expect(isAppVersionCompatible('1.0.1', '1.0.0')).toBe(true)
      expect(isAppVersionCompatible('1.1.0', '1.0.5')).toBe(true)
      expect(isAppVersionCompatible('2.0.0', '1.9.9')).toBe(true)
      expect(isAppVersionCompatible('0.1.0', '0.1.0')).toBe(true)
      expect(isAppVersionCompatible('0.1.0', '1.0.0')).toBe(false)
      expect(isAppVersionCompatible('1.0.0', '2.0.0')).toBe(false)
      expect(isAppVersionCompatible('1.2.3', '1.2.4')).toBe(false)
      expect(isAppVersionCompatible('1.0.0', undefined)).toBe(true)
    })
  })
})
