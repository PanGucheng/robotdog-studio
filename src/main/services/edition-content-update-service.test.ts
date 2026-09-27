import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { EditionContentResolver } from './edition-content-resolver'
import { EditionContentUpdateService } from './edition-content-update-service'
import { CourseService } from './course-service'
import { FirmwareBaselineResolver } from './firmware-baseline-resolver'
import { WorkspaceService } from './workspace-service'
import { EDITION_PROFILES } from '../../shared/edition'

const execFileAsync = promisify(execFile)
const temporaryDirs: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `test-content-${prefix}-`))
  temporaryDirs.push(dir)
  return dir
}

async function createTestContentZip(
  zipPath: string,
  editionId: 'mcu-foundations' | 'ti-mspm0-foundations',
  options?: {
    courseTitle?: string
    templateMarker?: string
    baselineShortCommit?: string
  }
): Promise<void> {
  const staging = await createTempDir('content-zip-stage')

  // 1. courses
  const coursesDir = join(staging, 'courses')
  await mkdir(coursesDir, { recursive: true })
  const courseId = editionId === 'ti-mspm0-foundations' ? 'ti-mspm0-gpio-foundations' : 'ch32v203-foundations'
  const lessonId = editionId === 'ti-mspm0-foundations' ? 'gpio-sysconfig-toggle' : 'first-program-on-chip'
  const templateId = editionId === 'ti-mspm0-foundations' ? 'ti-mspm0g3507-foundations' : 'first-program-on-chip'

  await writeFile(
    join(coursesDir, 'catalog.json'),
    JSON.stringify({
      schemaVersion: 1,
      courses: [{ courseId, manifest: `${courseId}/course.json` }]
    }, null, 2),
    'utf8'
  )

  await mkdir(join(coursesDir, courseId, 'lessons'), { recursive: true })
  await writeFile(
    join(coursesDir, courseId, 'course.json'),
    JSON.stringify({
      schemaVersion: 1,
      courseId,
      contentVersion: 12,
      title: options?.courseTitle ?? '远程教学内容测试课程',
      summary: '测试课程简介',
      audience: '测试学生',
      objectives: ['远程目标'],
      status: 'published',
      boardScope: editionId === 'ti-mspm0-foundations' ? 'MSPM0G3507' : 'CH32V203',
      lessonOrder: [lessonId],
      sourceAttribution: ['开发组']
    }, null, 2),
    'utf8'
  )

  await writeFile(
    join(coursesDir, courseId, 'lessons', `${lessonId}.json`),
    JSON.stringify({
      schemaVersion: 1,
      courseId,
      lessonId,
      title: '测试课时',
      summary: '课时测试',
      objectives: ['目标1'],
      prerequisites: [],
      estimatedMinutes: 30,
      hardware: 'optional',
      verification: 'not-required',
      expectedObservation: '现象正常',
      templateId,
      editableGlobs: ['App/Src/experiment.c'],
      readableFiles: [],
      deniedGlobs: [],
      steps: [{ stepId: 'step-1', type: 'read', title: '步骤1', instruction: '阅读' }],
      completionChecks: [],
      reflectionQuestions: [],
      aiContext: { teachingFocus: '教学焦点', hints: ['提示'] },
      status: 'published'
    }, null, 2),
    'utf8'
  )

  // 2. workspace-templates
  const templatesDir = join(staging, 'workspace-templates')
  await mkdir(templatesDir, { recursive: true })
  const templateDir = editionId === 'ti-mspm0-foundations'
    ? join(templatesDir, 'ti-mspm0g3507-foundations')
    : join(templatesDir, 'ch32v203-mcu-lessons', 'first-program-on-chip')
  await mkdir(templateDir, { recursive: true })
  await writeFile(
    join(templateDir, 'marker.txt'),
    options?.templateMarker ?? 'v2-remote-template-marker\n',
    'utf8'
  )
  if (editionId === 'mcu-foundations') {
    // Also include pony sandbox template
    const ponyTemplateDir = join(templatesDir, 'ch32v203-pony', '0.2.5', 'App', 'Src')
    await mkdir(ponyTemplateDir, { recursive: true })
    await writeFile(join(ponyTemplateDir, 'experiment.c'), '/* Remote Pony Template */\n', 'utf8')
  }

  // 3. firmware-baselines
  const baselinesDir = join(staging, 'firmware-baselines')
  await mkdir(baselinesDir, { recursive: true })
  const baselineDirName = editionId === 'ti-mspm0-foundations' ? 'ti-mspm0g3507' : 'ch32v203-rhs'
  const activeBaselineDir = join(baselinesDir, baselineDirName)
  await mkdir(activeBaselineDir, { recursive: true })
  const shortCommit = options?.baselineShortCommit ?? 'abc1234'

  if (editionId === 'mcu-foundations') {
    await writeFile(
      join(activeBaselineDir, 'active.json'),
      JSON.stringify({
        schemaVersion: 2,
        name: 'ch32v203-rhs',
        mode: 'development-local',
        activeCommit: `${shortCommit}000000000000000000000000000000000`,
        shortCommit,
        id: `ch32v203-rhs-baseline`,
        label: `CH32V203 RHS 远程教学基线 ${shortCommit}`,
        sourceRoot: 'firmware/ch32v203-baseline',
        verifiedFirmwareManifest: 'rhs.firmware.json',
        studentTemplate: 'resources/workspace-templates/ch32v203-mcu-lessons/first-program-on-chip'
      }, null, 2),
      'utf8'
    )
    await writeFile(
      join(activeBaselineDir, 'rhs.firmware.json'),
      JSON.stringify({
        board: 'rhs-ch32v203c8t6',
        chip: 'CH32V203C8T6',
        studentOverlay: { source: 'App/Src/experiment.c', header: 'App/Inc/experiment.h' }
      }, null, 2),
      'utf8'
    )
  } else {
    await writeFile(
      join(activeBaselineDir, 'active.json'),
      JSON.stringify({
        schemaVersion: 1,
        manifest: 'ti-mspm0g3507.firmware.json',
        packagedSource: 'current/source'
      }, null, 2),
      'utf8'
    )
  }

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

describe('EditionContentUpdateService and EditionContentResolver (Unified)', () => {
  const staticRoot = join(process.cwd(), 'resources')

  it('Requirement 1: Bundled fallback - 无远程内容时正常使用安装包内置资源', async () => {
    const userDataRoot = await createTempDir('bundled-fallback')
    const contentUserData = join(userDataRoot, 'content')
    const resolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: contentUserData,
      editionId: 'mcu-foundations'
    })

    expect(resolver.hasValidDownloadedContent()).toBe(false)
    expect(resolver.resolveCourseRoot()).toBe(join(staticRoot, 'courses', 'mcu-foundations'))
    expect(resolver.resolveWorkspaceTemplateRoot()).toBe(join(staticRoot, 'workspace-templates'))
    expect(resolver.resolveFirmwareBaselineRoot()).toBe(join(staticRoot, 'firmware-baselines'))

    const courseService = new CourseService({
      rootDir: () => resolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const courses = await courseService.listCourses()
    expect(courses.length).toBeGreaterThan(0)
    expect(courses[0].courseId).toBe('ch32v203-foundations')
  })

  it('Requirement 2: MCU Content Update - 统一更新课程、模板、固件基线并在重启后统一生效', async () => {
    const userDataRoot = await createTempDir('mcu-update')
    const contentUserData = join(userDataRoot, 'content')
    const resolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: contentUserData,
      editionId: 'mcu-foundations'
    })

    const zipFile = join(await createTempDir('mcu-remote-zip'), 'content.zip')
    await createTestContentZip(zipFile, 'mcu-foundations', {
      courseTitle: 'MCU 远程统一新课程 v4',
      templateMarker: 'mcu-v4-marker\n',
      baselineShortCommit: 'fedcba9'
    })
    const zipBytes = await readFile(zipFile)

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('update.json')) {
        return new Response(JSON.stringify({
          schemaVersion: 3,
          editions: {
            'mcu-foundations': {
              version: 4,
              minAppVersion: '0.1.0',
              url: 'https://fake-server/packages/mcu-foundations/content.zip'
            }
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('content.zip')) {
        return new Response(zipBytes, { status: 200, headers: { 'Content-Type': 'application/zip' } })
      }
      return new Response('Not found', { status: 404 })
    }

    const service = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations',
      fetchFn: mockFetch
    })

    expect(service.getLocalVersion()).toBe(0)
    const status = await service.checkForUpdate()
    expect(status.kind).toBe('updated')
    expect(status.message).toBe('教学内容更新完成，重启后生效')
    expect(status.currentVersion).toBe(4)

    // Verify disk content
    expect(resolver.hasValidDownloadedContent()).toBe(true)
    expect(resolver.getCachedState()?.version).toBe(4)

    // Simulate restart with new resolver
    const restartedResolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: contentUserData,
      editionId: 'mcu-foundations'
    })
    expect(restartedResolver.hasValidDownloadedContent()).toBe(true)

    // 1. Courses switched
    const restartedCourseService = new CourseService({
      rootDir: () => restartedResolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const courses = await restartedCourseService.listCourses()
    expect(courses[0].title).toBe('MCU 远程统一新课程 v4')

    // 2. Workspace templates switched
    const resolvedTemplates = restartedResolver.resolveWorkspaceTemplateRoot()
    const markerFile = join(resolvedTemplates, 'ch32v203-mcu-lessons', 'first-program-on-chip', 'marker.txt')
    expect(existsSync(markerFile)).toBe(true)
    expect(await readFile(markerFile, 'utf8')).toBe('mcu-v4-marker\n')

    // 3. Firmware baselines switched
    const resolvedBaselines = restartedResolver.resolveFirmwareBaselineRoot()
    const activeJson = join(resolvedBaselines, 'ch32v203-rhs', 'active.json')
    expect(existsSync(activeJson)).toBe(true)
    const activeData = JSON.parse(await readFile(activeJson, 'utf8'))
    expect(activeData.shortCommit).toBe('fedcba9')
  })

  it('Requirement 3: TI Content Update - 统一更新 TI 课程、模板、基线并在重启后统一生效', async () => {
    const userDataRoot = await createTempDir('ti-update')
    const contentUserData = join(userDataRoot, 'content')
    const resolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: contentUserData,
      editionId: 'ti-mspm0-foundations'
    })

    const zipFile = join(await createTempDir('ti-remote-zip'), 'content.zip')
    await createTestContentZip(zipFile, 'ti-mspm0-foundations', {
      courseTitle: 'TI MSPM0 远程统一新课程 v2',
      templateMarker: 'ti-v2-marker\n'
    })
    const zipBytes = await readFile(zipFile)

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('update.json')) {
        return new Response(JSON.stringify({
          schemaVersion: 3,
          editions: {
            'ti-mspm0-foundations': {
              version: 2,
              minAppVersion: '0.1.0',
              url: 'https://fake-server/packages/ti-mspm0-foundations/content.zip'
            }
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('content.zip')) {
        return new Response(zipBytes, { status: 200, headers: { 'Content-Type': 'application/zip' } })
      }
      return new Response('Not found', { status: 404 })
    }

    const service = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver,
      appVersion: '0.1.0',
      editionId: 'ti-mspm0-foundations',
      fetchFn: mockFetch
    })

    const status = await service.checkForUpdate()
    expect(status.kind).toBe('updated')
    expect(status.currentVersion).toBe(2)

    // Simulate restart
    const restartedResolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot: contentUserData,
      editionId: 'ti-mspm0-foundations'
    })
    expect(restartedResolver.hasValidDownloadedContent()).toBe(true)

    const courseService = new CourseService({
      rootDir: () => restartedResolver.resolveCourseRoot(),
      includeDrafts: true
    })
    const courses = await courseService.listCourses()
    expect(courses[0].title).toBe('TI MSPM0 远程统一新课程 v2')

    const resolvedTemplates = restartedResolver.resolveWorkspaceTemplateRoot()
    const markerFile = join(resolvedTemplates, 'ti-mspm0g3507-foundations', 'marker.txt')
    expect(existsSync(markerFile)).toBe(true)
    expect(await readFile(markerFile, 'utf8')).toBe('ti-v2-marker\n')
  })

  it('Requirement 4: Edition Isolation - 更新 MCU 内容绝不影响 TI 内容缓存，反之亦然', async () => {
    const userDataRoot = await createTempDir('isolation')
    const contentUserData = join(userDataRoot, 'content')

    const mcuResolver = new EditionContentResolver({ staticRoot, userDataContentRoot: contentUserData, editionId: 'mcu-foundations' })
    const tiResolver = new EditionContentResolver({ staticRoot, userDataContentRoot: contentUserData, editionId: 'ti-mspm0-foundations' })

    const mcuZip = join(await createTempDir('mcu-iso'), 'content.zip')
    await createTestContentZip(mcuZip, 'mcu-foundations', { courseTitle: '隔离测试 MCU 独占课程' })
    const mcuBytes = await readFile(mcuZip)

    const mockFetch: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('update.json')) {
        return new Response(JSON.stringify({
          schemaVersion: 3,
          editions: {
            'mcu-foundations': { version: 5, url: 'https://fake/mcu/content.zip' },
            'ti-mspm0-foundations': { version: 1, url: 'https://fake/ti/content.zip' }
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('mcu/content.zip')) {
        return new Response(mcuBytes, { status: 200, headers: { 'Content-Type': 'application/zip' } })
      }
      return new Response('Not found', { status: 404 })
    }

    const mcuService = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver: mcuResolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations',
      fetchFn: mockFetch
    })

    await mcuService.checkForUpdate()
    expect(mcuResolver.hasValidDownloadedContent()).toBe(true)
    expect(mcuResolver.getCachedState()?.version).toBe(5)

    // TI resolver must still fall back to bundled content
    expect(tiResolver.hasValidDownloadedContent()).toBe(false)
    expect(tiResolver.getCachedState()).toBeUndefined()
    expect(tiResolver.resolveCourseRoot()).toBe(join(staticRoot, 'courses', 'ti-mspm0-foundations'))
  })

  it('Requirement 5 & 6: Workspace Protection - 远程更新只影响未来新建工程，已有学生 Workspace 绝不被修改', async () => {
    const userDataRoot = await createTempDir('ws-protect')
    const contentUserData = join(userDataRoot, 'content')
    const workspacesRoot = join(userDataRoot, 'workspaces-dir')

    const resolver = new EditionContentResolver({ staticRoot, userDataContentRoot: contentUserData, editionId: 'mcu-foundations' })

    // 1. Create a workspace on v1 template
    const templateV1Root = await createTempDir('tmpl-v1')
    await writeFile(join(templateV1Root, 'UserCode.c'), '/* Student Code V1 */\n', 'utf8')

    const workspaces = new WorkspaceService({
      rootDir: workspacesRoot,
      templateRoot: templateV1Root,
      edition: EDITION_PROFILES['mcu-foundations']
    })
    const studentWs = await workspaces.create({ name: '保护测试工程', studentDisplayName: '李同学' })
    const studentFile = join(workspacesRoot, 'workspaces', studentWs.id, 'project', 'UserCode.c')
    expect(await readFile(studentFile, 'utf8')).toBe('/* Student Code V1 */\n')

    // Student modifies code
    await writeFile(studentFile, '/* Student modified experimental code */\n', 'utf8')

    // 2. Remote update to v2 content
    const zipFile = join(await createTempDir('mcu-v2-zip'), 'content.zip')
    await createTestContentZip(zipFile, 'mcu-foundations', { templateMarker: 'new-v2-template\n' })
    const zipBytes = await readFile(zipFile)

    const service = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations',
      fetchFn: async () => new Response(zipBytes, { status: 200 })
    })

    // Simulate direct download
    await (service as any).downloadAndApply({ version: 2, url: 'https://fake/content.zip' }, 'mcu-foundations')

    // 3. Existing workspace must be completely untouched!
    expect(await readFile(studentFile, 'utf8')).toBe('/* Student modified experimental code */\n')

    const listed = await workspaces.get(studentWs.id)
    expect(listed.name).toBe('保护测试工程')
    expect(listed.studentDisplayName).toBe('李同学')

    // 4. New workspace created from updated template gets new content
    const updatedResolver = new EditionContentResolver({ staticRoot, userDataContentRoot: contentUserData, editionId: 'mcu-foundations' })
    const updatedTemplateRoot = join(updatedResolver.resolveWorkspaceTemplateRoot(), 'ch32v203-mcu-lessons', 'first-program-on-chip')

    const newWorkspaces = new WorkspaceService({
      rootDir: workspacesRoot,
      templateRoot: updatedTemplateRoot,
      edition: EDITION_PROFILES['mcu-foundations']
    })
    const newWs = await newWorkspaces.create({ name: '新工程V2', studentDisplayName: '张同学' })
    const newFile = join(workspacesRoot, 'workspaces', newWs.id, 'project', 'marker.txt')
    expect(existsSync(newFile)).toBe(true)
    expect(await readFile(newFile, 'utf8')).toBe('new-v2-template\n')
  })

  it('Requirement 8 & 9: Robustness - 网络失败与损坏 ZIP 安全保障旧版本', async () => {
    const userDataRoot = await createTempDir('robustness')
    const contentUserData = join(userDataRoot, 'content')
    const resolver = new EditionContentResolver({ staticRoot, userDataContentRoot: contentUserData, editionId: 'mcu-foundations' })

    // Network error
    const netErrService = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations',
      fetchFn: async () => { throw new Error('NETWORK_TIMEOUT') }
    })
    const netStatus = await netErrService.checkForUpdate()
    expect(netStatus.kind).toBe('error')
    expect(netStatus.message).toBe('教学内容更新失败，继续使用当前版本')
    expect(resolver.hasValidDownloadedContent()).toBe(false)

    // Corrupt zip
    const corruptService = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations',
      fetchFn: async (input) => {
        if (String(input).endsWith('update.json')) {
          return new Response(JSON.stringify({
            schemaVersion: 3,
            editions: { 'mcu-foundations': { version: 10, url: 'https://fake/bad.zip' } }
          }), { status: 200 })
        }
        return new Response(Buffer.from('NOT_A_VALID_ZIP_FILE'), { status: 200 })
      }
    })
    const corruptStatus = await corruptService.checkForUpdate()
    expect(corruptStatus.kind).toBe('error')
    expect(corruptStatus.message).toBe('教学内容更新失败，继续使用当前版本')
    expect(resolver.hasValidDownloadedContent()).toBe(false)
  })

  it('Requirement 10: Publishing error protection - 阻止下发错误发行版的内容包', async () => {
    const userDataRoot = await createTempDir('mismatch-guard')
    const contentUserData = join(userDataRoot, 'content')
    const tiResolver = new EditionContentResolver({ staticRoot, userDataContentRoot: contentUserData, editionId: 'ti-mspm0-foundations' })

    // Provide MCU content to TI client
    const mcuZip = join(await createTempDir('mcu-for-ti'), 'content.zip')
    await createTestContentZip(mcuZip, 'mcu-foundations')
    const mcuBytes = await readFile(mcuZip)

    const tiService = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver: tiResolver,
      appVersion: '0.1.0',
      editionId: 'ti-mspm0-foundations',
      fetchFn: async (input) => {
        if (String(input).endsWith('update.json')) {
          return new Response(JSON.stringify({
            schemaVersion: 3,
            editions: { 'ti-mspm0-foundations': { version: 9, url: 'https://fake/ti-content.zip' } }
          }), { status: 200 })
        }
        return new Response(mcuBytes, { status: 200 })
      }
    })

    const status = await tiService.checkForUpdate()
    expect(status.kind).toBe('error')
    expect(status.message).toBe('教学内容更新失败，继续使用当前版本')
    expect(status.error).toContain('CONTENT_EDITION_MISMATCH')
    expect(tiResolver.hasValidDownloadedContent()).toBe(false)
  })

  it('Schema 3 complete structure enforcement - 缺少 templates 或 baselines 直接拒绝更新且不自动创建目录', async () => {
    const userDataRoot = await createTempDir('schema3-incomplete')
    const contentUserData = join(userDataRoot, 'content')
    const resolver = new EditionContentResolver({ staticRoot, userDataContentRoot: contentUserData, editionId: 'mcu-foundations' })

    // Create incomplete zip (has courses, but missing firmware-baselines and workspace-templates)
    const stageDir = await createTempDir('incomplete-stage')
    const coursesDir = join(stageDir, 'courses')
    await mkdir(coursesDir, { recursive: true })
    await writeFile(
      join(coursesDir, 'catalog.json'),
      JSON.stringify({ schemaVersion: 1, courses: [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }] }),
      'utf8'
    )
    await mkdir(join(coursesDir, 'ch32v203-foundations'), { recursive: true })
    await writeFile(
      join(coursesDir, 'ch32v203-foundations', 'course.json'),
      JSON.stringify({
        schemaVersion: 1,
        courseId: 'ch32v203-foundations',
        contentVersion: 1,
        title: '测试课程',
        summary: '摘要',
        audience: '学生',
        objectives: [],
        status: 'published',
        boardScope: 'CH32V203',
        lessonOrder: [],
        sourceAttribution: []
      }),
      'utf8'
    )

    const incompleteZip = join(await createTempDir('incomplete-zip'), 'content.zip')
    await execFileAsync('tar.exe', ['-a', '-c', '-f', incompleteZip, '-C', stageDir, '.'])
    const zipBytes = await readFile(incompleteZip)

    const service = new EditionContentUpdateService({
      userDataContentRoot: contentUserData,
      resolver,
      appVersion: '0.1.0',
      editionId: 'mcu-foundations',
      fetchFn: async (input) => {
        if (String(input).endsWith('update.json')) {
          return new Response(JSON.stringify({
            schemaVersion: 3,
            editions: { 'mcu-foundations': { version: 5, url: 'https://fake/incomplete.zip' } }
          }), { status: 200 })
        }
        return new Response(zipBytes, { status: 200 })
      }
    })

    const status = await service.checkForUpdate()
    expect(status.kind).toBe('error')
    expect(status.error).toContain('INVALID_CONTENT_ARCHIVE')
    expect(status.error).toContain('schemaVersion 3 requires complete content package')
    expect(resolver.hasValidDownloadedContent()).toBe(false)
    // Verify that missing directories were NOT created in current
    const currentDir = resolver.getCurrentDir('mcu-foundations')
    expect(existsSync(currentDir)).toBe(false)
  })
})
