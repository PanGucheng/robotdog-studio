import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

async function createTestCourseZip(zipPath: string, catalogData: unknown): Promise<void> {
  const staging = await createTempDir('zip-stage')
  await writeFile(join(staging, 'catalog.json'), JSON.stringify(catalogData, null, 2), 'utf8')
  await mkdir(join(staging, 'test-course', 'lessons'), { recursive: true })
  await mkdir(join(staging, 'test-course', 'lectures', 'lesson-one'), { recursive: true })
  await writeFile(join(staging, 'test-course', 'course.json'), JSON.stringify({
    schemaVersion: 1,
    courseId: 'test-course',
    contentVersion: 10,
    title: '测试远程课程',
    summary: '远程下载的测试课程',
    audience: '测试学生',
    objectives: ['远程目标1'],
    status: 'published',
    boardScope: 'CH32V203',
    lessonOrder: ['lesson-one'],
    sourceAttribution: ['测试机构']
  }, null, 2), 'utf8')

  await writeFile(join(staging, 'test-course', 'lessons', 'lesson-one.json'), JSON.stringify({
    schemaVersion: 1,
    courseId: 'test-course',
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
  }, null, 2), 'utf8')

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
  const realBundledRoot = join(process.cwd(), 'resources', 'courses', 'mcu-foundations')

  it('Test 1: 无远程缓存 -> 优先且正常加载安装包自带课程', async () => {
    const userDataRoot = await createTempDir('user-data-1')
    const coursesUserData = join(userDataRoot, 'courses')
    const resolver = new CourseResolver({
      bundledRoot: realBundledRoot,
      userDataCoursesRoot: coursesUserData
    })

    expect(resolver.hasValidDownloadedCourse()).toBe(false)
    expect(resolver.resolveCourseRoot()).toBe(realBundledRoot)

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
      bundledRoot: realBundledRoot,
      userDataCoursesRoot: coursesUserData
    })

    const zipFile = join(await createTempDir('remote-zip'), 'course.zip')
    await createTestCourseZip(zipFile, {
      schemaVersion: 1,
      courses: [{ courseId: 'test-course', manifest: 'test-course/course.json' }]
    })
    const zipBytes = await readFile(zipFile)

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('update.json')) {
        return new Response(JSON.stringify({
          version: 2,
          minAppVersion: '0.1.0',
          url: 'https://fake-server/course.zip'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.endsWith('course.zip')) {
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
      fetchFn: mockFetch,
      onCourseUpdated: (newRoot) => { notifiedNewRoot = newRoot }
    })

    expect(service.getLocalVersion()).toBe(0)
    const status = await service.checkForUpdate()
    expect(status.kind).toBe('updated')
    expect(status.currentVersion).toBe(2)
    expect(status.message).toBe('课程更新完成')
    expect(notifiedNewRoot).toBe(resolver.getCurrentDir())

    // Resolver now points to currentDir
    expect(resolver.hasValidDownloadedCourse()).toBe(true)
    expect(resolver.resolveCourseRoot()).toBe(resolver.getCurrentDir())
    expect(resolver.getCachedState()?.version).toBe(2)

    // CourseService now returns the updated course
    const courseService = new CourseService({
      rootDir: () => resolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const courses = await courseService.listCourses()
    expect(courses).toHaveLength(1)
    expect(courses[0].courseId).toBe('test-course')
    expect(courses[0].title).toBe('测试远程课程')
  })

  it('Test 3: 版本一致 -> 不重复下载 course.zip', async () => {
    const userDataRoot = await createTempDir('user-data-3')
    const coursesUserData = join(userDataRoot, 'courses')
    await mkdir(coursesUserData, { recursive: true })
    await writeFile(join(coursesUserData, 'state.json'), JSON.stringify({ version: 2 }), 'utf8')

    const resolver = new CourseResolver({
      bundledRoot: realBundledRoot,
      userDataCoursesRoot: coursesUserData
    })

    let zipRequested = false
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('update.json')) {
        return new Response(JSON.stringify({
          version: 2,
          minAppVersion: '0.1.0',
          url: 'https://fake-server/course.zip'
        }), { status: 200 })
      }
      if (url.endsWith('course.zip')) {
        zipRequested = true
        return new Response('should not be called', { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    }

    const service = new CourseUpdateService({
      userDataCoursesRoot: coursesUserData,
      resolver,
      appVersion: '0.1.0',
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
      bundledRoot: realBundledRoot,
      userDataCoursesRoot: coursesUserData
    })

    const mockFetch: typeof fetch = async () => {
      throw new Error('fetch failed: getaddrinfo ENOTFOUND gitee.com')
    }

    const service = new CourseUpdateService({
      userDataCoursesRoot: coursesUserData,
      resolver,
      appVersion: '0.1.0',
      fetchFn: mockFetch
    })

    const status = await service.checkForUpdate()
    expect(status.kind).toBe('error')
    expect(status.message).toBe('课程更新失败，继续使用当前版本')
    expect(resolver.resolveCourseRoot()).toBe(realBundledRoot)
  })

  it('Test 5: 下载中断 / 网络报错 -> 旧课程仍然存在且未损坏', async () => {
    const userDataRoot = await createTempDir('user-data-5')
    const coursesUserData = join(userDataRoot, 'courses')
    const currentDir = join(coursesUserData, 'current')
    await mkdir(currentDir, { recursive: true })
    await writeFile(join(currentDir, 'catalog.json'), JSON.stringify({
      schemaVersion: 1,
      courses: [{ courseId: 'old-course', manifest: 'old/course.json' }]
    }), 'utf8')
    await writeFile(join(coursesUserData, 'state.json'), JSON.stringify({ version: 1 }), 'utf8')

    const resolver = new CourseResolver({
      bundledRoot: realBundledRoot,
      userDataCoursesRoot: coursesUserData
    })

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('update.json')) {
        return new Response(JSON.stringify({
          version: 2,
          minAppVersion: '0.1.0',
          url: 'https://fake-server/course.zip'
        }), { status: 200 })
      }
      if (url.endsWith('course.zip')) {
        return new Response('Server Error', { status: 500 })
      }
      return new Response('Not found', { status: 404 })
    }

    const service = new CourseUpdateService({
      userDataCoursesRoot: coursesUserData,
      resolver,
      appVersion: '0.1.0',
      fetchFn: mockFetch
    })

    const status = await service.checkForUpdate()
    expect(status.kind).toBe('error')
    expect(status.message).toBe('课程更新失败，继续使用当前版本')

    // Old current still intact
    expect(resolver.hasValidDownloadedCourse()).toBe(true)
    const catalog = JSON.parse(await readFile(join(currentDir, 'catalog.json'), 'utf8'))
    expect(catalog.courses[0].courseId).toBe('old-course')
    expect(resolver.getCachedState()?.version).toBe(1)
  })

  it('Test 6: ZIP 损坏 -> 拒绝替换 current，继续使用旧课程', async () => {
    const userDataRoot = await createTempDir('user-data-6')
    const coursesUserData = join(userDataRoot, 'courses')
    const currentDir = join(coursesUserData, 'current')
    await mkdir(currentDir, { recursive: true })
    await writeFile(join(currentDir, 'catalog.json'), JSON.stringify({
      schemaVersion: 1,
      courses: [{ courseId: 'existing-course', manifest: 'existing/course.json' }]
    }), 'utf8')
    await writeFile(join(coursesUserData, 'state.json'), JSON.stringify({ version: 1 }), 'utf8')

    const resolver = new CourseResolver({
      bundledRoot: realBundledRoot,
      userDataCoursesRoot: coursesUserData
    })

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('update.json')) {
        return new Response(JSON.stringify({
          version: 2,
          minAppVersion: '0.1.0',
          url: 'https://fake-server/course.zip'
        }), { status: 200 })
      }
      if (url.endsWith('course.zip')) {
        // Return corrupt content
        return new Response(Buffer.from('not a valid zip file content'), { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    }

    const service = new CourseUpdateService({
      userDataCoursesRoot: coursesUserData,
      resolver,
      appVersion: '0.1.0',
      fetchFn: mockFetch
    })

    const status = await service.checkForUpdate()
    expect(status.kind).toBe('error')
    expect(status.message).toBe('课程更新失败，继续使用当前版本')

    // Current intact
    expect(resolver.hasValidDownloadedCourse()).toBe(true)
    const catalog = JSON.parse(await readFile(join(currentDir, 'catalog.json'), 'utf8'))
    expect(catalog.courses[0].courseId).toBe('existing-course')
  })

  it('Test 7: 应用重启 -> 再次启动直接读取最新缓存课程', async () => {
    const userDataRoot = await createTempDir('user-data-7')
    const coursesUserData = join(userDataRoot, 'courses')
    const currentDir = join(coursesUserData, 'current')

    // Setup an already updated course in cache
    await mkdir(currentDir, { recursive: true })
    await writeFile(join(currentDir, 'catalog.json'), JSON.stringify({
      schemaVersion: 1,
      courses: [{ courseId: 'cached-course', manifest: 'cached/course.json' }]
    }), 'utf8')
    await writeFile(join(coursesUserData, 'state.json'), JSON.stringify({ version: 5 }), 'utf8')

    // Simulate new app start:
    const newResolver = new CourseResolver({
      bundledRoot: realBundledRoot,
      userDataCoursesRoot: coursesUserData
    })

    expect(newResolver.hasValidDownloadedCourse()).toBe(true)
    expect(newResolver.resolveCourseRoot()).toBe(currentDir)
    expect(newResolver.getCachedState()?.version).toBe(5)
  })

  it('Test 8: 软件版本不兼容 -> minAppVersion > 当前版本，不下载，继续使用当前版本', async () => {
    const userDataRoot = await createTempDir('user-data-8')
    const coursesUserData = join(userDataRoot, 'courses')
    const resolver = new CourseResolver({
      bundledRoot: realBundledRoot,
      userDataCoursesRoot: coursesUserData
    })

    let zipRequested = false
    const mockFetch: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('update.json')) {
        return new Response(JSON.stringify({
          version: 2,
          minAppVersion: '2.0.0', // Requires app 2.0.0, but app is 1.0.0 (or 0.1.0)
          url: 'https://fake-server/course.zip'
        }), { status: 200 })
      }
      if (url.endsWith('course.zip')) {
        zipRequested = true
        return new Response('zip', { status: 200 })
      }
      return new Response('Not found', { status: 404 })
    }

    const service = new CourseUpdateService({
      userDataCoursesRoot: coursesUserData,
      resolver,
      appVersion: '1.0.0',
      fetchFn: mockFetch
    })

    const status = await service.checkForUpdate()
    expect(status.kind).toBe('incompatible')
    expect(status.message).toBe('新版课程需要更新软件后使用')
    expect(status.minAppVersion).toBe('2.0.0')
    expect(zipRequested).toBe(false)
  })

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
  it("Live Gitee verification: can fetch real update.json and download real course from Gitee", async () => {
    const userDataRoot = await createTempDir("user-data-live")
    const coursesUserData = join(userDataRoot, "courses")
    const resolver = new CourseResolver({
      bundledRoot: realBundledRoot,
      userDataCoursesRoot: coursesUserData
    })

    const service = new CourseUpdateService({
      userDataCoursesRoot: coursesUserData,
      resolver,
      appVersion: "0.1.0"
    })

    const status = await service.checkForUpdate()
    expect(["updated", "up-to-date"]).toContain(status.kind)
    expect(resolver.hasValidDownloadedCourse()).toBe(true)
    expect(resolver.getCachedState()?.version).toBeGreaterThanOrEqual(1)

    const courseService = new CourseService({
      rootDir: () => resolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const courses = await courseService.listCourses()
    expect(courses.length).toBeGreaterThan(0)
    expect(courses[0].courseId).toBe("ch32v203-foundations")
  }, 30000)
});
