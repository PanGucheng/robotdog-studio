import { join } from 'node:path'
import { cp, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { app, BrowserWindow, shell } from 'electron'
import { registerIpc } from './ipc/register-ipc'
import { MockRobotService } from './services/mock-robot-service'
import { WorkspaceService } from './services/workspace-service'
import { CandidateService } from './services/candidate-service'
import { AgentSessionService } from './services/agent-session-service'
import { ReasonixAcpAdapter } from './services/reasonix-acp-adapter'
import { ReasonixProcessManager } from './services/reasonix-process-manager'
import { DeepSeekSecretStore } from './services/deepseek-secret-store'
import { AgentHistoryService } from './services/agent-history-service'
import { ToolchainService } from './services/toolchain-service'
import { CandidateBuildService } from './services/candidate-build-service'
import { FirmwareBaselineService } from './services/firmware-baseline-service'
import { FirmwareBuildService } from './services/firmware-build-service'
import { DiagnosticService } from './services/diagnostic-service'
import { CourseService } from './services/course-service'
import { CourseProgressStore } from './services/course-progress-store'
import { DEFAULT_EDITION_ID, getEditionProfile, parseEditionId } from '../shared/edition'

const robot = new MockRobotService()
const edition = getEditionProfile(readEditionId())
app.setName(edition.productName)
const smokeUserData = process.env.ROBOTDOG_SMOKE_TEST === '1' ? process.env.ROBOTDOG_SMOKE_USER_DATA : undefined
app.setPath('userData', smokeUserData ? smokeUserData : join(app.getPath('appData'), edition.userDataDirectoryName))
let disposeIpc: (() => void) | undefined

function createWindow(): void {
  const smokeTest = process.env.ROBOTDOG_SMOKE_TEST === '1'
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f7fa',
    title: edition.productName,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (smokeTest) {
    window.webContents.once('did-finish-load', async () => {
      const result = await window.webContents.executeJavaScript(`(async () => {
        if (!window.robotDog) return { ok: false, reason: 'preload missing' }
        try {
        const [toolchain, baseline, runtime, activeEdition] = await Promise.all([
          window.robotDog.getToolchainStatus(), window.robotDog.getFirmwareBaselineStatus(), window.robotDog.getRuntimeInfo(), window.robotDog.getEditionProfile()
        ])
        const courses = activeEdition.id === 'mcu-foundations' ? await window.robotDog.listCourses() : []
        const course = courses[0] ? await window.robotDog.getCourse(courses[0].courseId) : undefined
        const lessonAttempt = course?.lessons[0] ? await window.robotDog.createLessonAttempt({ courseId: course.courseId, lessonId: course.lessons[0].lessonId, studentDisplayName: '测试同学' }) : undefined
        const secondLessonAttempt = course?.lessons[1] ? await window.robotDog.createLessonAttempt({ courseId: course.courseId, lessonId: course.lessons[1].lessonId, studentDisplayName: '测试同学' }) : undefined
        const lessonAttempts = course?.lessons[0] ? await window.robotDog.listLessonAttempts(course.courseId, course.lessons[0].lessonId) : []
        const secondLessonFiles = secondLessonAttempt ? await window.robotDog.listStudentCodeFiles(secondLessonAttempt.id) : []
        const completeLesson = async (attempt, lessonSummary) => {
          if (!attempt || !lessonSummary) return undefined
          const lesson = await window.robotDog.getCourseLesson(attempt.courseBinding.courseId, attempt.courseBinding.lessonId)
          const files = await window.robotDog.listStudentCodeFiles(attempt.id)
          const editable = files.find((file) => file.editable && file.path.endsWith('.c'))
          if (!editable) throw new Error('SMOKE_EDITABLE_FILE_MISSING')
          const draft = await window.robotDog.openManualDraft(attempt.id)
          await window.robotDog.writeManualDraft(draft.id, editable.path, editable.content + '\\n/* Electron smoke lesson edit */\\n')
          const validated = await window.robotDog.validateCandidate(draft.id)
          if (validated.state !== 'review_ready') throw new Error('SMOKE_CANDIDATE_VALIDATE_FAILED')
          const built = await window.robotDog.buildCandidate(draft.id)
          if (built.state !== 'build_passed') throw new Error('SMOKE_CANDIDATE_BUILD_FAILED')
          await window.robotDog.applyCandidate(draft.id)
          for (const step of lesson.steps.filter((item) => ['read', 'edit', 'review-apply', 'summary'].includes(item.type))) {
            await window.robotDog.updateCourseProgress(attempt.id, { kind: 'step', stepId: step.stepId, completed: true })
          }
          for (const question of lesson.reflectionQuestions) {
            await window.robotDog.updateCourseProgress(attempt.id, { kind: 'answer', questionId: question.questionId, answer: '自动冒烟回答：已理解本课要求，并会根据实际编译结果继续检查。' })
          }
          const firmware = await window.robotDog.startFirmwareBuild(attempt.id)
          return { firmware, progress: await window.robotDog.getCourseProgress(attempt.id) }
        }
        const firstLessonResult = lessonAttempt ? await completeLesson(lessonAttempt, course?.lessons[0]) : undefined
        const secondLessonResult = secondLessonAttempt ? await completeLesson(secondLessonAttempt, course?.lessons[1]) : undefined
        const existing = await window.robotDog.listWorkspaces()
        const workspace = secondLessonAttempt ?? lessonAttempt ?? existing.find((item) => item.firmwareBaselineId === baseline.id && item.baselineCommit === baseline.expectedCommit)
          ?? await window.robotDog.createWorkspace({ name: '桌面包自动验证', studentDisplayName: '测试同学' })
        const firmware = secondLessonResult?.firmware ?? firstLessonResult?.firmware ?? await window.robotDog.startFirmwareBuild(workspace.id)
        return {
          ok: Boolean(activeEdition.id === ${JSON.stringify(edition.id)} && workspace.learningPath === activeEdition.id && toolchain.gcc.ok && toolchain.objcopy.ok && toolchain.size.ok && baseline.readyForTesting && runtime.agent.installed && firmware.state === 'completed' && firmware.artifacts.length === 4 && (activeEdition.id !== 'mcu-foundations' || (courses.length > 0 && course?.lessons.length >= 2 && lessonAttempt?.workspacePurpose === 'mcu-lesson-attempt' && secondLessonAttempt?.workspacePurpose === 'mcu-lesson-attempt' && lessonAttempts.length === 1 && secondLessonFiles.some((file) => file.path === 'App/Src/number_tools.c' && file.editable) && firstLessonResult?.progress.state === 'completed' && secondLessonResult?.progress.state === 'completed'))),
          edition: activeEdition.id,
          courseCount: courses.length, lessonCount: course?.lessons.length ?? 0, lessonAttemptCount: lessonAttempts.length, secondLessonFileCount: secondLessonFiles.length,
          gcc: toolchain.gcc.ok, baseline: baseline.id, baselineReady: baseline.readyForTesting,
          releaseEligible: baseline.releaseEligible, reasonixInstalled: runtime.agent.installed,
          firstLessonProgress: firstLessonResult?.progress.state, secondLessonProgress: secondLessonResult?.progress.state,
          firmwareState: firmware.state, firmwareArtifacts: firmware.artifacts.map((item) => item.kind)
        }
        } catch (error) {
          return { ok: false, reason: String(error?.stack ?? error) }
        }
      })()`)
      console.log(result.ok ? `ROBOTDOG_SMOKE_OK ${JSON.stringify(result)}` : `ROBOTDOG_SMOKE_FAILED ${JSON.stringify(result)}`)
      app.exit(result.ok ? 0 : 1)
    })
    window.webContents.once('did-fail-load', (_event, code, description) => {
      console.error(`ROBOTDOG_SMOKE_LOAD_FAILED ${code} ${description}`)
      app.exit(1)
    })
  } else {
    window.once('ready-to-show', () => window.show())
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
  await migrateLegacyUserDataIfNeeded()
  const defaultRoot = join(app.getPath('userData'), 'managed-data')
  const rootOverride = process.env.ROBOTDOG_WORKSPACE_ROOT
  const workspaceRoot = rootOverride ? join(app.getPath('userData'), 'development', rootOverride.replace(/[^a-zA-Z0-9_-]/g, '_')) : defaultRoot
  const staticRoot = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  if (app.isPackaged) process.env.ROBOTDOG_GIT_EXE = join(staticRoot, 'toolchains', 'git', 'cmd', 'git.exe')
  const wchLinkDriver = await readWchLinkDriverStatus(staticRoot, app.isPackaged)
  const baselineRegistry = await readBaselineRegistry(staticRoot)
  const templateResource = edition.id === 'fun-line-following'
    ? baselineRegistry.studentTemplate
    : `resources/workspace-templates/ch32v203-mcu-foundations/${baselineRegistry.templateVersion}`
  const templateRoot = resolveStudentTemplateRoot(app.getAppPath(), staticRoot, templateResource, app.isPackaged)
  const baseline = new FirmwareBaselineService({
    manifestPath: baselineRegistry.manifestPath,
    packagedSourceRoot: app.isPackaged && baselineRegistry.packagedSource ? join(process.resourcesPath, 'firmware-baselines', 'ch32v203-robotdog', baselineRegistry.packagedSource) : undefined
  })
  const baselineManifest = await baseline.getManifest()
  const workspaces = new WorkspaceService({ rootDir: workspaceRoot, templateRoot, templateVersion: baselineRegistry.templateVersion, firmwareBaselineId: baselineManifest.id, baselineCommit: baselineManifest.source.expectedCommit, edition })
  await workspaces.initialize()
  const toolchain = new ToolchainService()
  const candidates = new CandidateService({ rootDir: workspaceRoot, workspaces, builder: new CandidateBuildService(toolchain, join(workspaceRoot, 'build-cache')) })
  await candidates.initialize()
  const courses = edition.id === 'mcu-foundations'
    ? new CourseService({
        rootDir: join(staticRoot, 'courses', 'mcu-foundations'),
        templatesRoot: join(staticRoot, 'workspace-templates', 'ch32v203-mcu-lessons'),
        includeDrafts: !app.isPackaged
      })
    : undefined
  const courseProgress = courses ? new CourseProgressStore(join(workspaceRoot, 'course-progress')) : undefined
  await courseProgress?.initialize()
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
  const agents = new AgentSessionService(candidates, new ReasonixAcpAdapter(processes, () => secrets.get()), courses && courseProgress ? async (workspaceId, taskKind) => {
    const workspace = await workspaces.get(workspaceId)
    if (!workspace.courseBinding || workspace.workspacePurpose !== 'mcu-lesson-attempt') return undefined
    const lesson = await courses.getLesson(workspace.courseBinding.courseId, workspace.courseBinding.lessonId)
    const files = (await candidates.listStudentCodeFiles(workspaceId)).map((file) => file.path)
    const progress = await courseProgress.get(workspace, lesson, files)
    return courses.buildAiContext(workspace.courseBinding.courseId, workspace.courseBinding.lessonId, taskKind, progress)
  } : undefined)
  const firmwareBuild = new FirmwareBuildService(toolchain, { baseline, workspaces, outputBase: join(workspaceRoot, 'firmware-artifacts') })
  await firmwareBuild.initialize()
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
  disposeIpc = registerIpc(robot, edition, toolchain, firmwareBuild, workspaces, candidates, agents, runtime, agentHistory, baseline, diagnostics, courses, undefined, courseProgress)
  createWindow()
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

function resolveStudentTemplateRoot(appRoot: string, staticRoot: string, studentTemplate: string, packaged: boolean): string {
  const normalized = studentTemplate.replace(/\\/g, '/')
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

async function readBaselineRegistry(staticRoot: string): Promise<{ manifestPath: string; packagedSource: string; studentTemplate: string; templateVersion: string }> {
  const path = join(staticRoot, 'firmware-baselines', 'ch32v203-robotdog', 'active.json')
  const value = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) throw new Error('ACTIVE_BASELINE_REGISTRY_INVALID')
  const safeRelative = (item: string): boolean => !item.startsWith('/') && !item.startsWith('\\') && !item.split(/[\\/]/).includes('..')
  if (value.schemaVersion === 1) {
    if (typeof value.manifest !== 'string' || typeof value.packagedSource !== 'string') throw new Error('ACTIVE_BASELINE_REGISTRY_INVALID')
    if (!safeRelative(value.manifest) || !safeRelative(value.packagedSource)) throw new Error('ACTIVE_BASELINE_REGISTRY_PATH_INVALID')
    return {
      manifestPath: join(staticRoot, 'firmware-baselines', 'ch32v203-robotdog', value.manifest),
      packagedSource: value.packagedSource,
      studentTemplate: 'resources/workspace-templates/ch32v203-robotdog/2026.06',
      templateVersion: '2026.06'
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
  if (process.env.ROBOTDOG_EDITION) return parseEditionId(process.env.ROBOTDOG_EDITION)
  try {
    const value = JSON.parse(readFileSync(join(app.getAppPath(), 'config', 'edition.json'), 'utf8')) as Record<string, unknown>
    if (value.schemaVersion !== 1) throw new Error('ROBOTDOG_EDITION_CONFIG_INVALID')
    return parseEditionId(value.edition)
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
