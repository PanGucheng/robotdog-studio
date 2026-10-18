import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cp, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { registerIpc } from './ipc/register-ipc'
import { prepareWindowsForAppInstall } from './ipc/app-update-ipc'
import { AppUpdateService } from './services/app-update-service'
import { appUpdateConfiguration, resolveEditionIdentity } from './services/app-update-config'
import { MockRobotService } from './services/mock-robot-service'
import { WorkspaceService } from './services/workspace-service'
import { CandidateService } from './services/candidate-service'
import { AgentSessionService } from './services/agent-session-service'
import { ReasonixAcpAdapter } from './services/reasonix-acp-adapter'
import { ReasonixProcessManager } from './services/reasonix-process-manager'
import { DeepSeekSecretStore } from './services/deepseek-secret-store'
import { AgentHistoryService } from './services/agent-history-service'
import { ToolchainService } from './services/toolchain-service'
import { TiMspm0ToolchainService } from './services/ti-mspm0-toolchain-service'
import { TiMspm0BuildService } from './services/ti-mspm0-build-service'
import { TiMspm0FlashService } from './services/ti-mspm0-flash-service'
import { WchLinkFlashService } from './services/wch-link-flash-service'
import { CandidateBuildService, PlatformCandidateBuildService } from './services/candidate-build-service'
import { TiMspm0CandidateBuildService } from './services/ti-mspm0-candidate-build-service'
import { FirmwareBaselineResolver } from './services/firmware-baseline-resolver'
import { FirmwareBaselineService } from './services/firmware-baseline-service'
import { resolveSandboxTemplateResources } from './services/sandbox-template-resources'
import { FirmwareBuildService } from './services/firmware-build-service'
import { DiagnosticService } from './services/diagnostic-service'
import { CourseService } from './services/course-service'
import { CourseResolver } from './services/course-resolver'
import { CourseUpdateService } from './services/course-update-service'
import { EditionContentResolver } from './services/edition-content-resolver'
import { EditionContentUpdateService } from './services/edition-content-update-service'
import { IPC_CHANNELS } from '../shared/channels'
import { CourseProgressStore } from './services/course-progress-store'
import { LessonLearningProgressStore } from './services/lesson-learning-progress-store'
import { McuRecentActivityStore } from './services/mcu-recent-activity-store'
import { CourseLectureHistoryService } from './services/course-lecture-history-service'
import { ProjectExplorerService } from './services/project-explorer-service'
import { DEFAULT_EDITION_ID, getEditionProfile, isMcuEdition, parseEditionId } from '../shared/edition'
import { WINDOW_THEME_CHANNEL, WINDOW_TITLE_BAR_HEIGHT } from '../shared/window-chrome'
import { isStudioThemeMode, studioTheme } from '../shared/studio-theme'
import { readThemePreference, saveThemePreference } from './services/studio-theme-preference'

const robot = new MockRobotService()
const edition = getEditionProfile(readEditionId())
app.setName(edition.productName)
const smokeUserData = process.env.ROBOTDOG_SMOKE_TEST === '1' ? process.env.ROBOTDOG_SMOKE_USER_DATA : undefined
app.setPath('userData', smokeUserData ? smokeUserData : join(app.getPath('appData'), edition.userDataDirectoryName))
let disposeIpc: (() => void) | undefined
let appUpdateService: AppUpdateService | undefined
let appUpdateScheduled = false

function createWindow(): void {
  const smokeTest = process.env.ROBOTDOG_SMOKE_TEST === '1'
  const themeMode = readThemePreference(join(app.getPath('userData'), 'studio-theme.json'))
  const theme = studioTheme(themeMode)
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: theme['surface-page'],
    icon: join(app.isPackaged ? process.resourcesPath : join(__dirname, '../../resources'), 'brand', 'robohorse.ico'),
    title: edition.productName,
    autoHideMenuBar: true,
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: { color: theme['surface-navigation'], symbolColor: theme.navy, height: WINDOW_TITLE_BAR_HEIGHT }
    } : {}),
    webPreferences: {
      additionalArguments: [`--studio-theme=${themeMode}`],
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (smokeTest) {
    window.webContents.once('did-finish-load', async () => {
      if (process.env.ROBOTDOG_VISUAL_ONLY === '1' && process.env.ROBOTDOG_VISUAL_REVIEW_DIR) {
        try {
          const { verifyStudioVisuals } = await import(pathToFileURL(join(app.getAppPath(), 'scripts/studio-visual-smoke.mjs')).href)
          await verifyStudioVisuals(window, process.env.ROBOTDOG_VISUAL_REVIEW_DIR, process.env.ROBOTDOG_VISUAL_BEFORE_CSS)
          console.log('ROBOTDOG_SMOKE_OK {"ok":true,"visualOnly":true}')
          app.exit(0)
        } catch (error) { console.error('ROBOTDOG_SMOKE_FAILED', String(error)); app.exit(1) }
        return
      }
      const result = await window.webContents.executeJavaScript(`(async () => {
        if (!window.robotDog) return { ok: false, reason: 'preload missing' }
        try {
        for (let attempt = 0; !document.querySelector('.studio-shell') && attempt < 50; attempt++) await new Promise(resolve => setTimeout(resolve, 100))
        const shell = document.querySelector('.studio-shell')
        if (!shell) throw new Error('SMOKE_STUDIO_SHELL_MISSING')
        const previousScale = document.documentElement.style.getPropertyValue('--ui-scale')
        try {
          for (const scale of [1, 1.25, 1.5, 1.75]) {
            document.documentElement.style.setProperty('--ui-scale', String(scale))
            const bounds = shell.getBoundingClientRect()
            const chromeHeight = window.studioWindowChrome?.customTitleBar ? window.studioWindowChrome.height : 0
            if (Math.abs(bounds.width - innerWidth) > 2 || Math.abs(bounds.height - (innerHeight - chromeHeight)) > 2 || Math.abs(bounds.top - chromeHeight) > 2) throw new Error('SMOKE_STUDIO_VIEWPORT_SIZE_MISMATCH: ' + JSON.stringify({ scale, width: bounds.width, height: bounds.height, innerWidth, innerHeight, chromeHeight }))
            if (chromeHeight) {
              const titlebar = document.querySelector('.window-titlebar')
              if (!titlebar || Math.abs(titlebar.getBoundingClientRect().height - chromeHeight) > 2 || getComputedStyle(titlebar).getPropertyValue('-webkit-app-region') !== 'drag') throw new Error('SMOKE_WINDOW_TITLEBAR_MISSING')
            }
          }
        } finally {
          if (previousScale) document.documentElement.style.setProperty('--ui-scale', previousScale)
          else document.documentElement.style.removeProperty('--ui-scale')
        }
        const [toolchain, baseline, runtime, activeEdition, health, appUpdate] = await Promise.all([
          window.robotDog.getToolchainStatus(), window.robotDog.getFirmwareBaselineStatus(), window.robotDog.getRuntimeInfo(), window.robotDog.getEditionProfile(),
          window.robotDog.getHealth(), window.robotDog.getAppUpdateStatus()
        ])
        if (health.appVersion !== ${JSON.stringify(app.getVersion())} || appUpdate.currentVersion !== health.appVersion || appUpdate.editionId !== activeEdition.id || appUpdate.kind !== 'disabled') throw new Error('SMOKE_APP_UPDATE_VERSION_OR_MODE_MISMATCH')
        const courses = activeEdition.id !== 'fun-line-following' ? await window.robotDog.listCourses() : []
        const expectedCourseId = activeEdition.id === 'ti-mspm0-foundations' ? 'ti-mspm0-gpio-foundations' : undefined
        const courseSummary = expectedCourseId ? courses.find((item) => item.courseId === expectedCourseId) : courses[0]
        const course = courseSummary ? await window.robotDog.getCourse(courseSummary.courseId) : undefined
        const firstLecture = course?.lessons[0] ? await window.robotDog.getCourseLecture(course.courseId, course.lessons[0].lessonId) : undefined
        const lessonAttempt = course?.lessons[0] ? await window.robotDog.createLessonAttempt({ courseId: course.courseId, lessonId: course.lessons[0].lessonId, studentDisplayName: '测试同学' }) : undefined
        const secondLessonAttempt = activeEdition.id === 'mcu-foundations' && course?.lessons[1] ? await window.robotDog.createLessonAttempt({ courseId: course.courseId, lessonId: course.lessons[1].lessonId, studentDisplayName: '测试同学' }) : undefined
        const lessonAttempts = course?.lessons[0] ? await window.robotDog.listLessonAttempts(course.courseId, course.lessons[0].lessonId) : []
        const secondLessonFiles = secondLessonAttempt ? await window.robotDog.listStudentCodeFiles(secondLessonAttempt.id) : []
        const completeLesson = async (attempt, lessonSummary) => {
          if (!attempt || !lessonSummary) return undefined
          const lesson = await window.robotDog.getCourseLesson(attempt.courseBinding.courseId, attempt.courseBinding.lessonId)
          const files = await window.robotDog.listStudentCodeFiles(attempt.id)
          const requiredChangedFile = lesson.completionChecks.find((check) => check.type === 'student-change-applied')?.target
          const editable = files.find((file) => file.editable && file.path === requiredChangedFile) ?? files.find((file) => file.editable && file.path.endsWith('.c'))
          if (!editable) throw new Error('SMOKE_EDITABLE_FILE_MISSING')
          await window.robotDog.writeWorkspaceFile(attempt.id, editable.path, editable.content + '\\n/* Electron smoke lesson edit */\\n')
          for (const step of lesson.steps.filter((item) => ['read', 'summary'].includes(item.type))) {
            if (step.type === 'read' && step.lectureSectionId && attempt.courseBinding.contentVersion === lesson.contentVersion) {
              const lecture = await window.robotDog.getCourseLecture(lesson.courseId, lesson.lessonId)
              if (lecture.status !== 'ready') throw new Error('SMOKE_LECTURE_MISSING')
              await window.robotDog.updateCourseProgress(attempt.id, { kind: 'step', stepId: step.stepId, completed: true })
            } else await window.robotDog.updateCourseProgress(attempt.id, { kind: 'step', stepId: step.stepId, completed: true })
          }
          for (const question of lesson.reflectionQuestions) {
            await window.robotDog.updateCourseProgress(attempt.id, { kind: 'answer', questionId: question.questionId, answer: '自动冒烟回答：已理解本课要求，并会根据实际编译结果继续检查。' })
          }
          const firmware = await window.robotDog.startFirmwareBuild(attempt.id)
          return { firmware, progress: await window.robotDog.getCourseProgress(attempt.id) }
        }
        const firstLessonResult = lessonAttempt ? await completeLesson(lessonAttempt, course?.lessons[0]) : undefined
        const secondLessonResult = secondLessonAttempt ? await completeLesson(secondLessonAttempt, course?.lessons[1]) : undefined
        const invalidateCompletedLesson = async (attempt, lessonSummary) => {
          if (!attempt || !lessonSummary) return undefined
          const lesson = await window.robotDog.getCourseLesson(attempt.courseBinding.courseId, attempt.courseBinding.lessonId)
          const requiredChangedFile = lesson.completionChecks.find((check) => check.type === 'student-change-applied')?.target
          const files = await window.robotDog.listStudentCodeFiles(attempt.id)
          const editable = files.find((file) => file.editable && file.path === requiredChangedFile) ?? files.find((file) => file.editable && file.path.endsWith('.c'))
          if (!editable) throw new Error('SMOKE_INVALIDATION_FILE_MISSING')
          await window.robotDog.writeWorkspaceFile(attempt.id, editable.path, editable.content + '\\n/* Source changed after completion */\\n')
          return window.robotDog.getCourseProgress(attempt.id)
        }
        const invalidatedFirstLessonProgress = firstLessonResult ? await invalidateCompletedLesson(lessonAttempt, course?.lessons[0]) : undefined
        const existing = await window.robotDog.listWorkspaces()
        const workspace = secondLessonAttempt ?? lessonAttempt ?? existing.find((item) => item.firmwareBaselineId === baseline.id && item.baselineCommit === baseline.expectedCommit)
          ?? await window.robotDog.createWorkspace({ name: '桌面包自动验证', studentDisplayName: '测试同学' })
        const explorer = activeEdition.id !== 'fun-line-following' ? await window.robotDog.getProjectExplorer(workspace.id) : undefined
        const explorerMain = explorer?.nodes.find((node) => node.displayPath === 'User/main.c')
        const explorerMainFile = explorerMain ? await window.robotDog.readProjectExplorerFile(workspace.id, explorerMain.id) : undefined
        const firmware = secondLessonResult?.firmware ?? firstLessonResult?.firmware ?? await window.robotDog.startFirmwareBuild(workspace.id)
        const postBuildExplorer = activeEdition.id === 'ti-mspm0-foundations' ? await window.robotDog.getProjectExplorer(workspace.id) : explorer
        const tiFiles = activeEdition.id === 'ti-mspm0-foundations' ? await window.robotDog.listStudentCodeFiles(workspace.id) : []
        const tiMain = postBuildExplorer?.nodes.find((node) => node.displayPath === 'src/main.c')
        const tiSyscfg = postBuildExplorer?.nodes.find((node) => node.displayPath === 'gpio_toggle_output.syscfg')
        const tiGenerated = postBuildExplorer?.nodes.find((node) => node.displayPath.startsWith('generated/') && node.kind === 'file')
        const tiLinker = postBuildExplorer?.nodes.find((node) => node.displayPath === 'gcc/device_linker.lds')
        let staleArtifactRejected = false
        if (activeEdition.id === 'ti-mspm0-foundations' && invalidatedFirstLessonProgress) {
          try { await window.robotDog.startFirmwareUpdate(workspace.id) }
          catch (error) { staleArtifactRejected = /变化|重新编译/.test(String(error)) }
        }
        const artifactKinds = firmware.artifacts.map((item) => item.kind).sort().join(',')
        const tiChecks = {
          course: course?.courseId === 'ti-mspm0-gpio-foundations' && course.lessons.length === 1 && course.lessons[0].lessonId === 'gpio-sysconfig-toggle',
          lecture: firstLecture?.status === 'ready', attempt: lessonAttempt?.workspacePurpose === 'mcu-lesson-attempt',
          workspace: workspace.learningPath === 'ti-mspm0-foundations' && workspace.platform === 'ti-mspm0' && workspace.target === 'MSPM0G3507' && workspace.toolchainProfile === 'ti-mspm0-sdk-2.11-gcc9-openocd',
          files: tiFiles.some((file) => file.path === 'src/main.c' && file.editable) && tiFiles.some((file) => file.path.endsWith('.syscfg') && file.editable),
          access: tiMain?.access === 'editable' && tiSyscfg?.access === 'editable' && tiGenerated?.access === 'read-only' && tiLinker?.access === 'read-only',
          tools: Boolean(toolchain.sdk?.ok && toolchain.sysconfig?.ok && toolchain.openocd.ok),
          build: firmware.state === 'completed' && artifactKinds === 'bin,elf,hex,map' && Boolean(firmware.proof),
          stale: invalidatedFirstLessonProgress?.operations['firmware-build'].state === 'stale' && staleArtifactRejected
        }
        const tiSmokeOk = activeEdition.id !== 'ti-mspm0-foundations' || Object.values(tiChecks).every(Boolean)
        const mcuChecks = {
          course: courses.length > 0 && Boolean(course?.lessons.length),
          lecture: firstLecture?.status === 'ready' && !JSON.stringify(firstLecture).includes('lecture.md'),
          attempt: lessonAttempt?.workspacePurpose === 'mcu-lesson-attempt' && lessonAttempts.length === 1,
          files: Boolean(explorer?.baselineAvailable && explorer.nodes.some((node) => node.kind === 'file' && node.access === 'editable' && node.displayPath.endsWith('.c'))),
          protectedSource: explorerMain?.access === 'read-only' && explorerMainFile?.content.includes('main'),
          build: firmware.state === 'completed' && artifactKinds === 'bin,elf,hex,map',
          stale: invalidatedFirstLessonProgress?.state === 'needs-attention' && invalidatedFirstLessonProgress?.operations['firmware-build'].state === 'stale'
        }
        const mcuSmokeOk = activeEdition.id !== 'mcu-foundations' || Object.values(mcuChecks).every(Boolean)
        if (activeEdition.id !== 'fun-line-following') {
          const freeWorkspace = await window.robotDog.createWorkspace({ name: '完整自由工程冒烟', studentDisplayName: '测试同学' })
          const freeExplorer = await window.robotDog.getProjectExplorer(freeWorkspace.id)
          const criticalPath = activeEdition.id === 'ti-mspm0-foundations' ? 'gcc/startup_mspm0g350x_gcc.c' : 'User/robotdog_runtime.c'
          const critical = freeExplorer.nodes.find(node => node.displayPath === criticalPath)
          if (!critical || critical.access !== 'editable' || freeExplorer.nodes.some(node => node.kind === 'file' && node.access !== 'editable')) throw new Error('SMOKE_SANDBOX_FILE_ACCESS')
          const sourceRoot = activeEdition.id === 'ti-mspm0-foundations' ? 'src' : 'App/Src'
          await window.robotDog.createWorkspaceDirectory(freeWorkspace.id, sourceRoot, 'modules')
          await window.robotDog.createWorkspaceDirectory(freeWorkspace.id, '', 'empty-folder')
          await window.robotDog.createWorkspaceFile(freeWorkspace.id, sourceRoot + '/modules', 'helper.h')
          await window.robotDog.createWorkspaceFile(freeWorkspace.id, sourceRoot + '/modules', 'helper.c')
          const createdExplorer = await window.robotDog.getProjectExplorer(freeWorkspace.id)
          if (!createdExplorer.nodes.some(node => node.displayPath === 'empty-folder' && node.kind === 'directory') || createdExplorer.nodes.some(node => node.name === '.gitkeep')) throw new Error('SMOKE_SANDBOX_EMPTY_DIRECTORY')
          await window.robotDog.writeWorkspaceFile(freeWorkspace.id, sourceRoot + '/modules/helper.h', '#pragma once\\nint Sandbox_Helper(void);\\n')
          await window.robotDog.writeWorkspaceFile(freeWorkspace.id, sourceRoot + '/modules/helper.c', '#include "helper.h"\\n#error SANDBOX_SMOKE_NEW_SOURCE\\nint Sandbox_Helper(void) { return 7; }\\n')
          const entryPath = activeEdition.id === 'ti-mspm0-foundations' ? 'src/main.c' : 'App/Src/experiment.c'
          const entryFile = (await window.robotDog.listStudentCodeFiles(freeWorkspace.id)).find(file => file.path === entryPath)
          if (!entryFile) throw new Error('SMOKE_SANDBOX_ENTRY_MISSING')
          const pattern = activeEdition.id === 'ti-mspm0-foundations' ? /int main\\(void\\)\\s*\\{/ : /void Experiment_Init\\(void\\)\\s*\\{/
          if (!pattern.test(entryFile.content)) throw new Error('SMOKE_SANDBOX_ENTRY_SIGNATURE')
          await window.robotDog.writeWorkspaceFile(freeWorkspace.id, entryPath, '#include "modules/helper.h"\\n' + entryFile.content.replace(pattern, match => match + '\\n    (void)Sandbox_Helper();\\n'))
          const original = await window.robotDog.readProjectExplorerFile(freeWorkspace.id, critical.id)
          await window.robotDog.writeWorkspaceFile(freeWorkspace.id, criticalPath, original.content + '\\n/* sandbox source access */\\n')
          const invalidBuild = await window.robotDog.startFirmwareBuild(freeWorkspace.id)
          if (invalidBuild.state !== 'failed' || !invalidBuild.logs.join(' ').includes('SANDBOX_SMOKE_NEW_SOURCE')) throw new Error('SMOKE_SANDBOX_MODIFICATION_IGNORED: ' + JSON.stringify(invalidBuild))
          await window.robotDog.writeWorkspaceFile(freeWorkspace.id, criticalPath, original.content + '\\n/* Sandbox smoke restored source */\\n')
          await window.robotDog.writeWorkspaceFile(freeWorkspace.id, sourceRoot + '/modules/helper.c', '#include \"helper.h\"\\nint Sandbox_Helper(void) { return 7; }\\n')
          const freeBuild = await window.robotDog.startFirmwareBuild(freeWorkspace.id)
          if (freeBuild.state !== 'completed') throw new Error('SMOKE_SANDBOX_BUILD: ' + JSON.stringify(freeBuild))
          if (activeEdition.id === 'ti-mspm0-foundations') {
            const generated = (await window.robotDog.listStudentCodeFiles(freeWorkspace.id)).find(file => file.path === 'generated/ti_msp_dl_config.c')
            if (!generated) throw new Error('SMOKE_SANDBOX_GENERATED_MISSING')
            await window.robotDog.writeWorkspaceFile(freeWorkspace.id, generated.path, generated.content + '\\n/* preserve student generated edit */\\n')
            const rebuilt = await window.robotDog.startFirmwareBuild(freeWorkspace.id)
            const retained = (await window.robotDog.listStudentCodeFiles(freeWorkspace.id)).find(file => file.path === generated.path)
            if (rebuilt.state !== 'completed' || !retained?.content.includes('preserve student generated edit')) throw new Error('SMOKE_SANDBOX_GENERATED_OVERWRITTEN')
          }
        }
        return {
          ok: Boolean(activeEdition.id === ${JSON.stringify(edition.id)} && workspace.learningPath === activeEdition.id && toolchain.gcc.ok && toolchain.objcopy.ok && toolchain.size.ok && baseline.readyForTesting && runtime.agent.installed && firmware.state === 'completed' && firmware.artifacts.length === 4 && !firmware.logs.some((line) => line === '进程结束 · exit code 0' || /^> .*gcc/i.test(line)) && tiSmokeOk && mcuSmokeOk),
          edition: activeEdition.id,
          appVersion: health.appVersion, appUpdateMode: appUpdate.kind,
          courseCount: courses.length, lessonCount: course?.lessons.length ?? 0, lessonAttemptCount: lessonAttempts.length, secondLessonFileCount: secondLessonFiles.length,
          gcc: toolchain.gcc.ok, baseline: baseline.id, baselineReady: baseline.readyForTesting,
          releaseEligible: baseline.releaseEligible, reasonixInstalled: runtime.agent.installed,
          firstLessonProgress: firstLessonResult?.progress.state, secondLessonProgress: secondLessonResult?.progress.state, explorerNodes: explorer?.nodes.length ?? 0,
          firstLessonAfterSourceChange: invalidatedFirstLessonProgress?.state,
          firmwareState: firmware.state, firmwareArtifacts: firmware.artifacts.map((item) => item.kind), firmwareLogLines: firmware.logs.length,
          mcuSmokeOk, mcuFailedChecks: activeEdition.id === 'mcu-foundations' ? Object.entries(mcuChecks).filter(([, passed]) => !passed).map(([name]) => name) : [],
          tiSmokeOk, tiFailedChecks: activeEdition.id === 'ti-mspm0-foundations' ? Object.entries(tiChecks).filter(([, passed]) => !passed).map(([name]) => name) : [], tiFileCount: tiFiles.length, staleArtifactRejected
        }
        } catch (error) {
          return { ok: false, reason: String(error?.stack ?? error) }
        }
      })()`)
      if (result.ok && process.env.ROBOTDOG_VISUAL_REVIEW_DIR) {
        try {
          const { verifyStudioVisuals } = await import(pathToFileURL(join(app.getAppPath(), 'scripts/studio-visual-smoke.mjs')).href)
          await verifyStudioVisuals(window, process.env.ROBOTDOG_VISUAL_REVIEW_DIR, process.env.ROBOTDOG_VISUAL_BEFORE_CSS)
        } catch (error) { result.ok = false; result.reason = String(error) }
      }
      console.log(result.ok ? `ROBOTDOG_SMOKE_OK ${JSON.stringify(result)}` : `ROBOTDOG_SMOKE_FAILED ${JSON.stringify(result)}`)
      app.exit(result.ok ? 0 : 1)
    })
    window.webContents.once('did-fail-load', (_event, code, description) => {
      console.error(`ROBOTDOG_SMOKE_LOAD_FAILED ${code} ${description}`)
      app.exit(1)
    })
  } else {
    window.once('ready-to-show', () => {
      window.show()
      if (appUpdateService && !appUpdateScheduled) {
        appUpdateScheduled = true
        const service = appUpdateService
        setTimeout(() => { void service.checkForUpdate().catch(error => console.warn('App update check failed', String(error))) }, 1500).unref()
      }
    })
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId(edition.appId)
  await migrateLegacyUserDataIfNeeded()
  const defaultRoot = join(app.getPath('userData'), 'managed-data')
  const rootOverride = process.env.ROBOTDOG_WORKSPACE_ROOT
  const workspaceRoot = rootOverride ? join(app.getPath('userData'), 'development', rootOverride.replace(/[^a-zA-Z0-9_-]/g, '_')) : defaultRoot
  const staticRoot = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  if (app.isPackaged) process.env.ROBOTDOG_GIT_EXE = join(staticRoot, 'toolchains', 'git', 'cmd', 'git.exe')
  const wchLinkDriver = await readWchLinkDriverStatus(staticRoot, app.isPackaged)
  const userDataContentRoot = join(app.getPath('userData'), 'content')
  const preferLocal = !app.isPackaged && !process.env.ROBOTDOG_SMOKE_USER_DATA
  const contentResolver = new EditionContentResolver({
    staticRoot,
    userDataContentRoot,
    editionId: edition.id,
    preferLocal
  })
  const resolvedBaselinesRoot = contentResolver.resolveFirmwareBaselineRoot()
  const resolvedTemplatesRoot = contentResolver.resolveWorkspaceTemplateRoot()

  const baselineResolver = new FirmwareBaselineResolver({
    staticRoot,
    firmwareBaselinesRoot: resolvedBaselinesRoot,
    isPackaged: app.isPackaged,
    appPath: app.getAppPath()
  })
  const baselineRegistry = await readBaselineRegistry(staticRoot, resolvedBaselinesRoot)
  const templateResource = baselineRegistry.studentTemplate
  const templateRoot = resolveStudentTemplateRoot(app.getAppPath(), staticRoot, templateResource, app.isPackaged, resolvedTemplatesRoot)
  const baseline = new FirmwareBaselineService({
    manifestPath: baselineRegistry.manifestPath,
    packagedSourceRoot: app.isPackaged && baselineRegistry.packagedSource ? join(process.resourcesPath, 'firmware-baselines', edition.platform === 'ti-mspm0' ? 'ti-mspm0g3507' : edition.id === 'mcu-foundations' ? 'ch32v203-rhs' : 'ch32v203-robotdog', baselineRegistry.packagedSource) : undefined,
    developmentSourceRoot: edition.platform === 'ti-mspm0' ? templateRoot : undefined
  })
  const baselineManifest = await baseline.getManifest()
  baselineResolver.register(baselineManifest.id, baseline)

  let sandboxDefaults: { templateRoot: string; templateVersion: string; templateId: string; firmwareBaselineId: string; baselineCommit: string } | undefined
  if (edition.id === 'mcu-foundations') {
    const ponyBaseline = baselineResolver.resolve('ch32v203-pony-v25')
    const ponyManifest = await ponyBaseline.getManifest()
    const ponyTemplateRoot = resolveStudentTemplateRoot(app.getAppPath(), staticRoot, 'resources/workspace-templates/ch32v203-pony/0.2.5', app.isPackaged, resolvedTemplatesRoot)
    sandboxDefaults = {
      templateRoot: ponyTemplateRoot,
      templateVersion: ponyManifest.source.expectedCommit.slice(0, 7),
      templateId: 'ch32v203-pony',
      firmwareBaselineId: ponyManifest.id,
      baselineCommit: ponyManifest.source.expectedCommit
    }
  }

  const sandboxTemplates: import('./services/workspace-service').WorkspaceServiceOptions['sandboxTemplates'] = {}
  if (isMcuEdition(edition.id)) {
    for (const projectType of ['sdk-empty', 'pony'] as const) {
      if (edition.id === 'mcu-foundations' && projectType === 'pony') continue
      const directory = edition.platform === 'ti-mspm0' ? `ti-mspm0g3507-${projectType}` : 'ch32v203-sdk-empty'
      const resources = resolveSandboxTemplateResources(staticRoot, resolvedTemplatesRoot, resolvedBaselinesRoot, directory)
      const source = resources.templateRoot
      const service = new FirmwareBaselineService({
        manifestPath: resources.manifestPath,
        developmentSourceRoot: source
      })
      const manifest = await service.getManifest()
      baselineResolver.register(manifest.id, service)
      sandboxTemplates[projectType] = { templateRoot: source, templateId: directory, templateVersion: projectType === 'pony' ? '0.2.5-ti.1' : '1', firmwareBaselineId: manifest.id, baselineCommit: manifest.source.expectedCommit }
    }
    if (edition.id === 'mcu-foundations' && sandboxDefaults) sandboxTemplates.pony = { ...sandboxDefaults, materializeBaseline: true }
  }

  const toolchain = edition.platform === 'ti-mspm0' ? new TiMspm0ToolchainService() : new ToolchainService()
  const workspaces = new WorkspaceService({
    rootDir: workspaceRoot,
    templateRoot,
    templateVersion: baselineRegistry.templateVersion,
    firmwareBaselineId: baselineManifest.id,
    baselineCommit: baselineManifest.source.expectedCommit,
    edition,
    sandboxDefaults,
    sandboxTemplates,
    sandboxSourceResolver: async workspace => {
      const resolved = await baselineResolver.resolveForWorkspace(workspace).requireTestingBaseline()
      if (resolved.manifest.source.expectedCommit !== workspace.baselineCommit) throw new Error('SANDBOX_BASELINE_MISMATCH')
      return resolved.sourceRoot
    },
    sandboxStartupSource: toolchain instanceof TiMspm0ToolchainService ? join(toolchain.sdkRoot, 'source', 'ti', 'devices', 'msp', 'm0p', 'startup_system_files', 'gcc', 'startup_mspm0g350x_gcc.c') : undefined
  })
  await workspaces.initialize()
  const candidateCache = join(workspaceRoot, 'build-cache')
  const candidates = new CandidateService({
    rootDir: workspaceRoot,
    workspaces,
    builder: new PlatformCandidateBuildService(
      new CandidateBuildService(new ToolchainService(), candidateCache, baselineResolver),
      new TiMspm0CandidateBuildService(new TiMspm0ToolchainService(), candidateCache)
    )
  })
  await candidates.initialize()
  const projectExplorer = isMcuEdition(edition.id) ? new ProjectExplorerService(workspaces, candidates, baselineResolver) : undefined
  const courses = isMcuEdition(edition.id)
    ? new CourseService({
        rootDir: () => contentResolver.resolveCourseRoot(),
        templatesRoot: () => join(contentResolver.resolveWorkspaceTemplateRoot(), edition.platform === 'ti-mspm0' ? '' : 'ch32v203-mcu-lessons'),
        includeDrafts: !app.isPackaged
      })
    : undefined
  const courseUpdateService = isMcuEdition(edition.id)
    ? new EditionContentUpdateService({
        userDataContentRoot,
        resolver: contentResolver,
        appVersion: app.getVersion(),
        editionId: edition.id,
        onContentUpdated: async (_newRoot, status) => {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC_CHANNELS.courseUpdateEvent, status)
          }
        },
        onStatusChange: (status) => {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC_CHANNELS.courseUpdateEvent, status)
          }
        }
      })
    : undefined
  const courseProgress = courses ? new CourseProgressStore(join(workspaceRoot, 'course-progress')) : undefined
  await courseProgress?.initialize()
  const lessonLearning = courses ? new LessonLearningProgressStore(join(workspaceRoot, 'lesson-learning-progress')) : undefined
  await lessonLearning?.initialize()
  const mcuRecentActivity = courses ? new McuRecentActivityStore(join(workspaceRoot, 'ui-state', 'mcu-recent-activity.json')) : undefined
  await mcuRecentActivity?.initialize()
  const reasonixRuntime = await readReasonixRuntimeManifest(app.getAppPath(), staticRoot)
  const reasonixVersion = reasonixRuntime.version
  const processes = new ReasonixProcessManager({
    version: reasonixVersion,
    binarySha256: reasonixRuntime.binarySha256,
    binaryPath: reasonixRuntime.binaryPath,
    sessionDataRoot: join(workspaceRoot, 'reasonix-sessions')
  })
  const secrets = new DeepSeekSecretStore(join(app.getPath('userData'), 'secure', 'deepseek-api-key.bin'))
  const agentHistory = new AgentHistoryService(join(workspaceRoot, 'conversations'))
  await agentHistory.initialize()
  const lectureHistory = courses ? new CourseLectureHistoryService(join(workspaceRoot, 'course-conversations')) : undefined
  await lectureHistory?.initialize()
  const lessonAgentRoot = join(workspaceRoot, 'lesson-agent-readonly')
  await mkdir(lessonAgentRoot, { recursive: true })
  const agents = new AgentSessionService(candidates, new ReasonixAcpAdapter(processes, () => secrets.get()), courses && courseProgress ? async (workspaceId, taskKind) => {
    const workspace = await workspaces.get(workspaceId)
    if (!workspace.courseBinding || workspace.workspacePurpose !== 'mcu-lesson-attempt') return undefined
    const lesson = await courses.getLesson(workspace.courseBinding.courseId, workspace.courseBinding.lessonId)
    const files = (await candidates.listStudentCodeFiles(workspaceId)).map((file) => file.path)
    const progress = await courseProgress.get(workspace, lesson, files)
    return courses.buildAiContext(workspace.courseBinding.courseId, workspace.courseBinding.lessonId, taskKind, progress)
  } : undefined, courses ? { root: lessonAgentRoot, policyVersion: 'mcu-foundations-v1:1' } : undefined)
  const firmwareBuild = edition.platform === 'ti-mspm0'
    ? new TiMspm0BuildService(toolchain as TiMspm0ToolchainService, workspaces, join(workspaceRoot, 'firmware-artifacts'), baselineResolver)
    : new FirmwareBuildService(toolchain as ToolchainService, { baseline: baselineResolver, workspaces, outputBase: join(workspaceRoot, 'firmware-artifacts') })
  await firmwareBuild.initialize()
  const programmer = edition.platform === 'ti-mspm0'
    ? new TiMspm0FlashService(toolchain as TiMspm0ToolchainService, firmwareBuild as TiMspm0BuildService)
    : new WchLinkFlashService(toolchain as ToolchainService, firmwareBuild as FirmwareBuildService)
  const runtime = { secrets, processes, version: reasonixVersion }
  const diagnostics = new DiagnosticService({
    dataRoot: workspaceRoot,
    getRuntimeInfo: async () => ({
      mode: 'simulation',
      workspaceCount: (await workspaces.list()).length,
      workspaceTemplate: { root: templateRoot, exists: await directoryExists(templateRoot) },
      wchLinkDriver,
      toolchain: await toolchain.getStatus(),
      baseline: await baseline.getStatus(),
      agent: await getAgentRuntimeStatus(runtime)
    })
  })
  let formal = false
  try { formal = JSON.parse(readFileSync(join(app.getAppPath(), 'config', 'app-update.json'), 'utf8')).releaseMode === 'formal' } catch { /* Development and legacy packages are disabled by default. */ }
  appUpdateService = new AppUpdateService({
    editionId: edition.id, currentVersion: app.getVersion(), updatesRoot: join(app.getPath('userData'), 'updates'),
    ...appUpdateConfiguration(app.isPackaged, process.platform, formal, process.env),
    onStatus: status => { for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.appUpdateEvent, status) },
    prepareInstall: prepareWindowsForAppInstall,
    launchInstaller: path => shell.openPath(path), quit: () => app.quit()
  })
  disposeIpc = registerIpc(robot, edition, toolchain, firmwareBuild, workspaces, candidates, agents, runtime, agentHistory, baseline, diagnostics, courses, programmer, courseProgress, projectExplorer, lessonLearning, mcuRecentActivity, lectureHistory, baselineResolver, courseUpdateService, appUpdateService, app.getVersion())
  ipcMain.handle(WINDOW_THEME_CHANNEL, (event, mode: unknown) => {
    if (!isStudioThemeMode(mode)) throw new Error('INVALID_STUDIO_THEME')
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed() || event.senderFrame !== event.sender.mainFrame) throw new Error('INVALID_THEME_WINDOW')
    const theme = studioTheme(mode)
    owner.setBackgroundColor(theme['surface-page'])
    if (process.platform === 'win32') owner.setTitleBarOverlay({ color: theme['surface-navigation'], symbolColor: theme.navy, height: WINDOW_TITLE_BAR_HEIGHT })
    saveThemePreference(join(app.getPath('userData'), 'studio-theme.json'), mode)
  })
  createWindow()
  if (courseUpdateService && process.env.ROBOTDOG_SMOKE_TEST !== '1') {
    setTimeout(() => {
      if (appUpdateService?.isInstalling()) return
      courseUpdateService.checkForUpdate({ silent: true }).catch((err) => {
        console.warn('Background course update check failed:', err)
      })
    }, 1500)
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  if (robot.getStatus().connection === 'ready') robot.runAction('stop')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => disposeIpc?.())

function resolveStudentTemplateRoot(appRoot: string, staticRoot: string, studentTemplate: string, packaged: boolean, resolvedTemplatesRoot?: string): string {
  const normalized = studentTemplate.replace(/\\/g, '/')
  if (resolvedTemplatesRoot) {
    const templateSubPath = normalized.startsWith('resources/workspace-templates/')
      ? normalized.slice('resources/workspace-templates/'.length)
      : normalized.startsWith('workspace-templates/')
        ? normalized.slice('workspace-templates/'.length)
        : undefined
    if (templateSubPath) {
      const candidate = join(resolvedTemplatesRoot, templateSubPath)
      if (existsSync(candidate)) return candidate
    }
  }
  if (packaged && normalized.startsWith('resources/')) return join(staticRoot, normalized.slice('resources/'.length))
  return join(packaged ? staticRoot : appRoot, studentTemplate)
}

async function directoryExists(path: string): Promise<boolean> {
  return stat(path).then((info) => info.isDirectory(), () => false)
}

async function fileExists(path: string): Promise<boolean> {
  return stat(path).then((info) => info.isFile(), () => false)
}

async function readWchLinkDriverStatus(staticRoot: string, packaged: boolean): Promise<import('../shared/types').WchLinkDriverInstallStatus> {
  const driverRoot = join(staticRoot, 'toolchains', 'wch', 'drivers', 'WCHLinkDrv')
  const infPath = join(driverRoot, 'WCHLinkWDM.INF')
  if (!packaged) return { enabled: false, attempted: false, ok: false, driverRoot, infPath, detail: '开发模式：WCH-Link 驱动由安装器负责安装，应用本身不请求管理员权限。' }
  const infExists = await fileExists(infPath)
  return {
    enabled: true,
    attempted: false,
    ok: infExists,
    driverRoot,
    infPath,
    detail: infExists
      ? 'WCH-Link 驱动文件已打包。驱动由 NSIS 安装器在安装阶段通过 pnputil 自动安装，应用本身以普通权限运行。'
      : '安装包内没有找到 WCH-Link 驱动 INF。驱动应由安装器在安装阶段安装。'
  }
}

async function getAgentRuntimeStatus(runtime: { secrets: DeepSeekSecretStore; processes: ReasonixProcessManager; version: string }): Promise<import('../shared/types').AgentRuntimeStatus> {
  const [installed, apiKeyConfigured] = await Promise.all([
    runtime.processes.verifyBinary().then(() => true, () => false),
    runtime.secrets.has()
  ])
  return {
    adapter: 'reasonix', version: runtime.version, installed, apiKeyConfigured,
    ready: installed && apiKeyConfigured,
    detail: !installed ? 'Reasonix 文件缺失或校验失败' : !apiKeyConfigured ? '请配置 DeepSeek API Key' : 'Reasonix ACP 已就绪'
  }
}

async function readBaselineRegistry(staticRoot: string, baselinesRoot?: string): Promise<{ manifestPath: string; packagedSource: string; studentTemplate: string; templateVersion: string }> {
  const baselineDir = edition.platform === 'ti-mspm0' ? 'ti-mspm0g3507' : edition.id === 'mcu-foundations' ? 'ch32v203-rhs' : 'ch32v203-robotdog'
  const root = baselinesRoot ?? join(staticRoot, 'firmware-baselines')
  const path = join(root, baselineDir, 'active.json')
  const value = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) throw new Error('ACTIVE_BASELINE_REGISTRY_INVALID')
  const safeRelative = (item: string): boolean => !item.startsWith('/') && !item.startsWith('\\') && !item.split(/[\\/]/).includes('..')
  if (value.schemaVersion === 1) {
    if (typeof value.manifest !== 'string' || typeof value.packagedSource !== 'string') throw new Error('ACTIVE_BASELINE_REGISTRY_INVALID')
    if (!safeRelative(value.manifest) || !safeRelative(value.packagedSource)) throw new Error('ACTIVE_BASELINE_REGISTRY_PATH_INVALID')
    return {
      manifestPath: join(root, baselineDir, value.manifest),
      packagedSource: value.packagedSource,
      studentTemplate: edition.platform === 'ti-mspm0' ? 'resources/workspace-templates/ti-mspm0g3507-foundations' : 'resources/workspace-templates/ch32v203-robotdog/2026.06',
      templateVersion: edition.platform === 'ti-mspm0' ? 'sdk-2.11.00.07' : '2026.06'
    }
  }
  if (typeof value.studentTemplate !== 'string' || typeof value.shortCommit !== 'string') throw new Error('ACTIVE_BASELINE_REGISTRY_INVALID')
  if (!safeRelative(value.studentTemplate)) throw new Error('ACTIVE_BASELINE_REGISTRY_PATH_INVALID')
  return { manifestPath: path, packagedSource: 'current/source', studentTemplate: value.studentTemplate, templateVersion: value.shortCommit }
}

async function readReasonixRuntimeManifest(appRoot: string, staticRoot: string): Promise<{ version: string; binarySha256: string; binaryPath: string }> {
  const manifest = JSON.parse(await readFile(join(appRoot, 'config', 'reasonix-runtime.json'), 'utf8')) as Record<string, unknown>
  if (typeof manifest.version !== 'string' || typeof manifest.binarySha256 !== 'string' || typeof manifest.binaryRelativePath !== 'string') {
    throw new Error('REASONIX_RUNTIME_MANIFEST_INVALID')
  }
  const prefix = 'resources/'
  if (!manifest.binaryRelativePath.startsWith(prefix) || manifest.binaryRelativePath.split(/[\\/]/).includes('..')) {
    throw new Error('REASONIX_RUNTIME_PATH_INVALID')
  }
  return {
    version: manifest.version,
    binarySha256: manifest.binarySha256,
    binaryPath: join(staticRoot, manifest.binaryRelativePath.slice(prefix.length))
  }
}

function readEditionId(): import('../shared/edition').EditionId {
  if (!app.isPackaged && process.env.ROBOTDOG_EDITION) return parseEditionId(process.env.ROBOTDOG_EDITION)
  try {
    const value = JSON.parse(readFileSync(join(app.getAppPath(), 'config', 'edition.json'), 'utf8')) as Record<string, unknown>
    return resolveEditionIdentity(app.isPackaged, process.env.ROBOTDOG_EDITION, value)
  } catch (caught) {
    if (!app.isPackaged) return DEFAULT_EDITION_ID
    throw caught
  }
}

async function migrateLegacyUserDataIfNeeded(): Promise<void> {
  if (edition.id !== 'fun-line-following') return
  const targetRoot = app.getPath('userData')
  const targetManaged = join(targetRoot, 'managed-data')
  if (await stat(targetManaged).then((info) => info.isDirectory(), () => false)) return
  const legacyRoot = join(app.getPath('appData'), 'robotdog-studio')
  const legacyManaged = join(legacyRoot, 'managed-data')
  if (!(await stat(legacyManaged).then((info) => info.isDirectory(), () => false))) return
  await mkdir(targetRoot, { recursive: true })
  const temporaryManaged = join(targetRoot, '.legacy-managed-data-migrating')
  await rm(temporaryManaged, { recursive: true, force: true })
  await cp(legacyManaged, temporaryManaged, { recursive: true, verbatimSymlinks: true })
  await rename(temporaryManaged, targetManaged)
  const legacySecret = join(legacyRoot, 'secure')
  const targetSecret = join(targetRoot, 'secure')
  if (await stat(legacySecret).then((info) => info.isDirectory(), () => false)) {
    await cp(legacySecret, targetSecret, { recursive: true, errorOnExist: true, force: false }).catch(() => undefined)
  }
}
