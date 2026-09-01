import { BrowserWindow, ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/channels'
import type { AgentRuntimeStatus, AppHealth, CandidateSnapshot, CourseOperationKind, FirmwareUpdateEvent } from '../../shared/types'
import { FirmwareBuildService } from '../services/firmware-build-service'
import { MockRobotService } from '../services/mock-robot-service'
import { MockConnectivityService } from '../services/mock-connectivity-service'
import { MockRecoveryService } from '../services/mock-recovery-service'
import { ToolchainService } from '../services/toolchain-service'
import { WorkspaceService } from '../services/workspace-service'
import { CandidateService } from '../services/candidate-service'
import { AgentSessionService } from '../services/agent-session-service'
import { DeepSeekSecretStore } from '../services/deepseek-secret-store'
import { ReasonixProcessManager } from '../services/reasonix-process-manager'
import { AgentHistoryService } from '../services/agent-history-service'
import { FirmwareBaselineService } from '../services/firmware-baseline-service'
import { DiagnosticService } from '../services/diagnostic-service'
import { WchLinkFlashService } from '../services/wch-link-flash-service'
import { TiMspm0BuildService } from '../services/ti-mspm0-build-service'
import { TiMspm0FlashService } from '../services/ti-mspm0-flash-service'
import { CourseService } from '../services/course-service'
import { CourseProgressStore } from '../services/course-progress-store'
import { ProjectExplorerService } from '../services/project-explorer-service'
import { LessonLearningProgressStore, topLevelSectionIds } from '../services/lesson-learning-progress-store'
import { McuRecentActivityStore } from '../services/mcu-recent-activity-store'
import { CourseLectureHistoryService } from '../services/course-lecture-history-service'
import type { AppEditionProfile } from '../../shared/edition'

export interface AgentRuntimeServices { secrets: DeepSeekSecretStore; processes: ReasonixProcessManager; version: string }

export function registerIpc(robot: MockRobotService, edition: AppEditionProfile, toolchain: ToolchainService | import('../services/ti-mspm0-toolchain-service').TiMspm0ToolchainService = new ToolchainService(), firmware: FirmwareBuildService | TiMspm0BuildService = new FirmwareBuildService(toolchain as ToolchainService), workspaces?: WorkspaceService, candidates?: CandidateService, agents?: AgentSessionService, agentRuntime?: AgentRuntimeServices, agentHistory?: AgentHistoryService, baseline?: FirmwareBaselineService, diagnostics?: DiagnosticService, courses?: CourseService, wchLink: WchLinkFlashService | TiMspm0FlashService = new WchLinkFlashService(toolchain as ToolchainService, firmware as FirmwareBuildService), courseProgress?: CourseProgressStore, projectExplorer?: ProjectExplorerService, lessonLearning?: LessonLearningProgressStore, mcuRecentActivity?: McuRecentActivityStore, lectureHistory?: CourseLectureHistoryService): () => void {
  const connectivity = new MockConnectivityService(robot)
  const recovery = new MockRecoveryService(robot)
  const sendToAll = (channel: string, payload: unknown): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload)
    }
  }

  const statusListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotStatusEvent, payload)
  const logListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotLogEvent, payload)
  const ccdListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.robotCcdEvent, payload)
  const buildListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.firmwareBuildEvent, payload)
  const connectionListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.deviceConnectionEvent, payload)
  let activeUpdateWorkspaceId: string | undefined
  const updateListener = (payload: unknown): void => {
    sendToAll(IPC_CHANNELS.firmwareUpdateEvent, payload)
    const event = payload as FirmwareUpdateEvent
    if (activeUpdateWorkspaceId && (event.type === 'completed' || event.type === 'failed')) {
      void recordCourseOperation(activeUpdateWorkspaceId, 'flash', event.type === 'completed', event.snapshot.error ?? event.snapshot.message)
      activeUpdateWorkspaceId = undefined
    }
  }
  const recoveryListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.recoveryEvent, payload)
  const wchLinkListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.wchLinkEvent, payload)
  const agentListener = (payload: unknown): void => {
    const event = payload as import('../../shared/types').AgentEvent
    if (agentHistory) void agentHistory.append(event)
    if (lectureHistory) void lectureHistory.append(event)
    sendToAll(IPC_CHANNELS.agentEvent, payload)
  }

  async function getLegacyLearningSeed(courseId: string, lessonId: string, lesson: Awaited<ReturnType<CourseService['getLesson']>>, document: import('../../shared/types').CourseLectureDocument): Promise<string[]> {
    if (!workspaces || !courseProgress || lesson.contentVersion !== 4) return []
    const attempts = (await workspaces.listLessonAttempts(courseId, lessonId)).filter((workspace) => workspace.courseBinding?.contentVersion === 3)
    const evidence = new Set<string>()
    for (const workspace of attempts) {
      for (const sectionId of await courseProgress.getCompletedLegacyLectureSectionIds(workspace, lesson).catch(() => [])) evidence.add(sectionId)
    }
    const learningUnits = new Set(topLevelSectionIds(document))
    return [...evidence].filter((sectionId) => learningUnits.has(sectionId))
  }

  async function getCourseProgressContext(workspaceId: string): Promise<{ workspace: Awaited<ReturnType<WorkspaceService['get']>>; lesson: Awaited<ReturnType<CourseService['getLesson']>>; files: string[] }> {
    if (!workspaces || !courses || !courseProgress) throw new Error('COURSE_PROGRESS_SERVICE_UNAVAILABLE')
    const workspace = await workspaces.get(workspaceId)
    if (!workspace.courseBinding || workspace.workspacePurpose !== 'mcu-lesson-attempt') throw new Error('COURSE_PROGRESS_WORKSPACE_REQUIRED')
    const lesson = await courses.getLesson(workspace.courseBinding.courseId, workspace.courseBinding.lessonId)
    const files = candidates ? (await candidates.listStudentCodeFiles(workspaceId)).map((file) => file.path) : []
    return { workspace, lesson, files }
  }

  async function recordCourseOperation(workspaceId: string, kind: CourseOperationKind, passed: boolean, detail: string): Promise<void> {
    if (!courseProgress || !courses || !workspaces) return
    const workspace = await workspaces.get(workspaceId).catch(() => undefined)
    if (!workspace?.courseBinding || workspace.workspacePurpose !== 'mcu-lesson-attempt') return
    const lesson = await courses.getLesson(workspace.courseBinding.courseId, workspace.courseBinding.lessonId)
    const files = candidates ? (await candidates.listStudentCodeFiles(workspaceId)).map((file) => file.path) : []
    await courseProgress.recordOperation(workspace, lesson, kind, passed, detail, files)
  }

  async function recordCourseSourceChange(workspaceId: string, kind: 'candidate-applied' | 'workspace-edited' | 'workspace-undone', changedFiles: string[] = []): Promise<void> {
    if (!courseProgress || !courses || !workspaces) return
    const workspace = await workspaces.get(workspaceId).catch(() => undefined)
    if (!workspace?.courseBinding || workspace.workspacePurpose !== 'mcu-lesson-attempt') return
    const lesson = await courses.getLesson(workspace.courseBinding.courseId, workspace.courseBinding.lessonId)
    const files = candidates ? (await candidates.listStudentCodeFiles(workspaceId)).map((file) => file.path) : []
    await courseProgress.recordSourceChange(workspace, lesson, kind, changedFiles, files)
  }

  robot.on('status', statusListener)
  robot.on('log', logListener)
  robot.on('ccd', ccdListener)
  firmware.on('event', buildListener)
  connectivity.on('connection', connectionListener)
  connectivity.on('update', updateListener)
  recovery.on('event', recoveryListener)
  wchLink.on('event', wchLinkListener)
  agents?.on('event', agentListener)

  ipcMain.handle(IPC_CHANNELS.editionProfileGet, () => structuredClone(edition))

  ipcMain.handle(IPC_CHANNELS.healthGet, async (): Promise<AppHealth> => {
    const toolchainStatus = await toolchain.getStatus()
    return {
      appVersion: '0.1.0',
      platform: process.platform,
      mode: 'simulation',
      checks: [
        { id: 'serial', label: '串口服务', status: 'ready', detail: '模拟设备可用' },
        { id: 'gcc', label: '内置 WCH GCC12', status: toolchainStatus.gcc.ok ? 'ready' : 'unavailable', detail: toolchainStatus.gcc.detail },
        { id: 'openocd', label: '内置 WCH OpenOCD', status: toolchainStatus.openocd.ok ? 'ready' : 'unavailable', detail: toolchainStatus.openocd.detail },
        { id: 'reasonix', label: 'Reasonix', status: agentRuntime && await agentRuntimeStatus(agentRuntime).then((value) => value.ready) ? 'ready' : 'unavailable', detail: agentRuntime ? `固定版本 ${agentRuntime.version}` : '未配置运行时' }
      ]
    }
  })
  if (diagnostics) {
    ipcMain.handle(IPC_CHANNELS.runtimeInfoGet, () => diagnostics.getRuntimeInfo())
    ipcMain.handle(IPC_CHANNELS.diagnosticsExport, () => diagnostics.export())
    ipcMain.handle(IPC_CHANNELS.dataDirectoryOpen, async () => (await shell.openPath(diagnostics.dataRoot)) === '')
  }
  ipcMain.handle(IPC_CHANNELS.robotStatusGet, () => robot.getStatus())
  ipcMain.handle(IPC_CHANNELS.robotConnectDemo, () => robot.connectDemo())
  ipcMain.handle(IPC_CHANNELS.robotDisconnect, () => robot.disconnect())
  ipcMain.handle(IPC_CHANNELS.robotActionRun, (_event, action: unknown) => robot.runAction(action))
  ipcMain.handle(IPC_CHANNELS.robotCcdCapture, () => robot.captureCcd())
  ipcMain.handle(IPC_CHANNELS.firmwareToolchainStatus, () => toolchain.getStatus())
  ipcMain.handle(IPC_CHANNELS.firmwareBaselineStatus, () => {
    if (!baseline) throw new Error('固件基线服务尚未配置')
    return baseline.getStatus()
  })
  ipcMain.handle(IPC_CHANNELS.firmwareBuildStart, async (_event, workspaceId: unknown) => {
    if (typeof workspaceId !== 'string') throw new Error('请先创建或选择一个学生对话')
    const result = await firmware.build({ workspaceId })
    await recordCourseOperation(workspaceId, 'firmware-build', result.state === 'completed', result.error ?? (result.state === 'completed' ? '完整程序生成成功' : '完整程序生成失败'))
    return result
  })
  ipcMain.handle(IPC_CHANNELS.firmwareBuildCancel, () => firmware.cancel())
  ipcMain.handle(IPC_CHANNELS.tiSysconfigOpen, (_event, workspaceId: unknown) => {
    if (typeof workspaceId !== 'string' || !(firmware instanceof TiMspm0BuildService)) throw new Error('SysConfig 仅在 TI MSPM0 教学版中可用。')
    return firmware.openSysconfig(workspaceId)
  })
  ipcMain.handle(IPC_CHANNELS.deviceConnectionGet, () => connectivity.getConnection())
  ipcMain.handle(IPC_CHANNELS.simulationUsbSet, (_event, connected: unknown) => {
    if (typeof connected !== 'boolean') throw new Error('USB 模拟状态必须是布尔值')
    return connectivity.setUsbConnected(connected)
  })
  ipcMain.handle(IPC_CHANNELS.firmwareUpdateGet, () => connectivity.getUpdate())
  ipcMain.handle(IPC_CHANNELS.firmwareUpdateStart, async (_event, workspaceId: unknown) => {
    if (typeof workspaceId !== 'string') throw new Error('请先选择学生对话')
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(recovery.getSnapshot().state)) throw new Error('教师恢复进行中，不能同时下载学生固件')
    const binary = await firmware.requireCurrentArtifact(workspaceId, 'bin')
    activeUpdateWorkspaceId = workspaceId
    return connectivity.startUpdate(binary)
  })
  ipcMain.handle(IPC_CHANNELS.firmwareUpdateCancel, () => connectivity.cancelUpdate())
  ipcMain.handle(IPC_CHANNELS.recoveryGet, () => recovery.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.recoveryStart, () => {
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(connectivity.getUpdate().state)) throw new Error('学生固件下载进行中，不能同时执行教师恢复')
    return recovery.start()
  })
  ipcMain.handle(IPC_CHANNELS.recoveryCancel, () => recovery.cancel())
  ipcMain.handle(IPC_CHANNELS.wchLinkGet, () => wchLink.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.wchLinkProbe, () => wchLink.probe())
  ipcMain.handle(IPC_CHANNELS.wchLinkFlash, async (_event, workspaceId: unknown) => {
    if (typeof workspaceId !== 'string') throw new Error('请先选择学生对话')
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(connectivity.getUpdate().state)) throw new Error('板载 USB 下载进行中，不能同时使用外部下载器烧录')
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(recovery.getSnapshot().state)) throw new Error('教师恢复进行中，不能同时使用外部下载器烧录')
    if (firmware.getSnapshot().state === 'running') throw new Error('完整固件正在生成，请等待完成后再烧录')
    const result = await wchLink.flashCurrent(workspaceId)
    await recordCourseOperation(workspaceId, 'flash', result.state === 'completed', result.error ?? result.message)
    return result
  })
  ipcMain.handle(IPC_CHANNELS.wchLinkCancel, () => wchLink.cancel())
  if (workspaces) {
    ipcMain.handle(IPC_CHANNELS.workspaceList, () => workspaces.list())
    ipcMain.handle(IPC_CHANNELS.workspaceCreate, async (_event, input: unknown) => {
      const workspace = await workspaces.create(input as never)
      sendToAll(IPC_CHANNELS.workspaceChangedEvent, workspace)
      return workspace
    })
    ipcMain.handle(IPC_CHANNELS.workspaceRename, async (_event, workspaceId: unknown, name: unknown) => {
      if (typeof workspaceId !== 'string' || typeof name !== 'string') throw new Error('WORKSPACE_RENAME_INVALID')
      const workspace = await workspaces.renameWorkspace(workspaceId, name)
      sendToAll(IPC_CHANNELS.workspaceChangedEvent, workspace)
      return workspace
    })
    ipcMain.handle(IPC_CHANNELS.workspaceGet, (_event, workspaceId: unknown) => {
      if (typeof workspaceId !== 'string') throw new Error('WORKSPACE_ID_INVALID')
      return workspaces.get(workspaceId)
    })
    ipcMain.handle(IPC_CHANNELS.workspaceHistory, (_event, workspaceId: unknown, limit: unknown) => {
      if (typeof workspaceId !== 'string') throw new Error('WORKSPACE_ID_INVALID')
      if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit))) throw new Error('WORKSPACE_HISTORY_LIMIT_INVALID')
      return workspaces.history(workspaceId, limit as number | undefined)
    })
    ipcMain.handle(IPC_CHANNELS.workspaceUndo, async (_event, workspaceId: unknown) => {
      if (typeof workspaceId !== 'string') throw new Error('WORKSPACE_ID_INVALID')
      const workspace = await workspaces.undoLast(workspaceId)
      await recordCourseSourceChange(workspace.id, 'workspace-undone')
      sendToAll(IPC_CHANNELS.workspaceChangedEvent, workspace)
      return workspace
    })
  }
  if (edition.id !== 'fun-line-following') {
    ipcMain.handle(IPC_CHANNELS.courseList, () => {
      if (!courses) throw new Error('COURSE_SERVICE_UNAVAILABLE')
      return courses.listCourses()
    })
    ipcMain.handle(IPC_CHANNELS.courseGet, (_event, courseId: unknown) => {
      if (!courses) throw new Error('COURSE_SERVICE_UNAVAILABLE')
      if (typeof courseId !== 'string') throw new Error('COURSE_ID_INVALID')
      return courses.getCourse(courseId)
    })
    ipcMain.handle(IPC_CHANNELS.courseLessonGet, (_event, courseId: unknown, lessonId: unknown) => {
      if (!courses) throw new Error('COURSE_SERVICE_UNAVAILABLE')
      if (typeof courseId !== 'string' || typeof lessonId !== 'string') throw new Error('COURSE_LESSON_ID_INVALID')
      return courses.getLesson(courseId, lessonId)
    })
    ipcMain.handle(IPC_CHANNELS.courseLectureGet, (_event, courseId: unknown, lessonId: unknown) => {
      if (!courses) throw new Error('COURSE_SERVICE_UNAVAILABLE')
      if (typeof courseId !== 'string' || typeof lessonId !== 'string') throw new Error('COURSE_LECTURE_ID_INVALID')
      return courses.getLecture(courseId, lessonId)
    })
    ipcMain.handle(IPC_CHANNELS.courseLectureAssetGet, (_event, courseId: unknown, lessonId: unknown, documentDigest: unknown, assetId: unknown) => {
      if (!courses) throw new Error('COURSE_SERVICE_UNAVAILABLE')
      if (typeof courseId !== 'string' || typeof lessonId !== 'string' || typeof documentDigest !== 'string' || typeof assetId !== 'string') throw new Error('COURSE_LECTURE_ASSET_INPUT_INVALID')
      return courses.getLectureAsset(courseId, lessonId, documentDigest, assetId)
    })
    if (agents) ipcMain.handle(IPC_CHANNELS.courseLectureAsk, async (_event, input: unknown) => {
      if (!input || typeof input !== 'object') throw new Error('COURSE_LECTURE_QUESTION_INVALID')
      const value = input as import('../../shared/types').CourseLectureQuestionInput
      if (typeof value.courseId !== 'string' || typeof value.lessonId !== 'string' || typeof value.contentVersion !== 'number' || typeof value.documentDigest !== 'string' || !value.request || typeof value.request.question !== 'string') throw new Error('COURSE_LECTURE_QUESTION_INVALID')
      const lesson = await courses!.getLesson(value.courseId, value.lessonId)
      const lecture = await courses!.getLecture(value.courseId, value.lessonId)
      if (lecture.status !== 'ready' || lecture.document.contentVersion !== value.contentVersion || lecture.document.documentDigest !== value.documentDigest) throw new Error('LECTURE_DOCUMENT_STALE')
      let progress: import('../../shared/types').CourseProgressSnapshot | undefined
      if (value.workspaceId) {
        const context = await getCourseProgressContext(value.workspaceId)
        if (context.lesson.courseId !== value.courseId || context.lesson.lessonId !== value.lessonId) throw new Error('COURSE_LECTURE_WORKSPACE_MISMATCH')
        progress = courseProgress ? await courseProgress.get(context.workspace, context.lesson, context.files) : undefined
      }
      const rebuilt = await courses!.buildLectureQuestionContext(lesson.courseId, lesson.lessonId, value.request, progress)
      return agents.explainCourseLecture({ courseId: value.courseId, lessonId: value.lessonId, contentVersion: value.contentVersion, documentDigest: value.documentDigest, ...(value.workspaceId ? { workspaceId: value.workspaceId } : {}) }, value.request.question, rebuilt.selectedText, rebuilt.trustedContext)
    })
    ipcMain.handle(IPC_CHANNELS.courseLectureHistoryList, async (_event, courseId: unknown, lessonId: unknown, includeOlder: unknown) => {
      if (!lectureHistory || !courses || typeof courseId !== 'string' || typeof lessonId !== 'string' || (includeOlder !== undefined && typeof includeOlder !== 'boolean')) throw new Error('COURSE_LECTURE_HISTORY_INPUT_INVALID')
      const lecture = await courses.getLecture(courseId, lessonId)
      if (lecture.status !== 'ready') return []
      return lectureHistory.list(courseId, lessonId, Boolean(includeOlder), { contentVersion: lecture.document.contentVersion, documentDigest: lecture.document.documentDigest })
    })
    ipcMain.handle(IPC_CHANNELS.lessonLearningProgressGet, async (_event, courseId: unknown, lessonId: unknown) => {
      if (!lessonLearning || !courses || typeof courseId !== 'string' || typeof lessonId !== 'string') throw new Error('LESSON_LEARNING_PROGRESS_INPUT_INVALID')
      const lesson = await courses.getLesson(courseId, lessonId)
      const lecture = await courses.getLecture(courseId, lessonId)
      if (lecture.status !== 'ready') throw new Error('LESSON_LEARNING_LECTURE_UNAVAILABLE')
      const seed = await getLegacyLearningSeed(courseId, lessonId, lesson, lecture.document)
      return lessonLearning.get(lesson, lecture.document, seed)
    })
    ipcMain.handle(IPC_CHANNELS.lessonLearningProgressList, (_event, courseId: unknown) => {
      if (!lessonLearning || (courseId !== undefined && typeof courseId !== 'string')) throw new Error('LESSON_LEARNING_PROGRESS_INPUT_INVALID')
      return lessonLearning.list(courseId as string | undefined)
    })
    ipcMain.handle(IPC_CHANNELS.lessonLearningProgressUpdate, async (_event, courseId: unknown, lessonId: unknown, update: unknown) => {
      if (!lessonLearning || !courses || typeof courseId !== 'string' || typeof lessonId !== 'string' || !update || typeof update !== 'object') throw new Error('LESSON_LEARNING_PROGRESS_INPUT_INVALID')
      const lesson = await courses.getLesson(courseId, lessonId)
      const lecture = await courses.getLecture(courseId, lessonId)
      if (lecture.status !== 'ready') throw new Error('LESSON_LEARNING_LECTURE_UNAVAILABLE')
      await lessonLearning.get(lesson, lecture.document, await getLegacyLearningSeed(courseId, lessonId, lesson, lecture.document))
      return lessonLearning.update(lesson, lecture.document, update as import('../../shared/types').LessonLearningProgressUpdate)
    })
    ipcMain.handle(IPC_CHANNELS.mcuRecentActivityList, () => {
      if (!mcuRecentActivity) throw new Error('MCU_RECENT_ACTIVITY_UNAVAILABLE')
      return mcuRecentActivity.list()
    })
    ipcMain.handle(IPC_CHANNELS.mcuRecentActivityRecord, (_event, activity: unknown) => {
      if (!mcuRecentActivity || !activity || typeof activity !== 'object') throw new Error('MCU_RECENT_ACTIVITY_INVALID')
      return mcuRecentActivity.record(activity as never)
    })
    ipcMain.handle(IPC_CHANNELS.externalUrlOpen, async (_event, input: unknown) => {
      if (typeof input !== 'string' || input.length > 2_000) throw new Error('EXTERNAL_URL_INVALID')
      let url: URL
      try { url = new URL(input) } catch { throw new Error('EXTERNAL_URL_INVALID') }
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('EXTERNAL_URL_FORBIDDEN')
      await shell.openExternal(url.toString())
      return true
    })
    ipcMain.handle(IPC_CHANNELS.courseLessonAttemptsList, (_event, courseId: unknown, lessonId: unknown) => {
      if (!workspaces) throw new Error('WORKSPACE_SERVICE_UNAVAILABLE')
      if (typeof courseId !== 'string' || typeof lessonId !== 'string') throw new Error('COURSE_LESSON_ID_INVALID')
      return workspaces.listLessonAttempts(courseId, lessonId)
    })
    ipcMain.handle(IPC_CHANNELS.courseLessonAttemptCreate, async (_event, input: unknown) => {
      if (!courses || !workspaces) throw new Error('COURSE_WORKSPACE_SERVICE_UNAVAILABLE')
      if (!input || typeof input !== 'object') throw new Error('COURSE_LESSON_ATTEMPT_INPUT_INVALID')
      const value = input as Record<string, unknown>
      if (typeof value.courseId !== 'string' || typeof value.lessonId !== 'string' || typeof value.studentDisplayName !== 'string') throw new Error('COURSE_LESSON_ATTEMPT_INPUT_INVALID')
      const spec = await courses.getWorkspaceCreationSpec(value.courseId, value.lessonId)
      const workspace = await workspaces.createLessonAttempt({ courseId: value.courseId, lessonId: value.lessonId, studentDisplayName: value.studentDisplayName }, spec)
      sendToAll(IPC_CHANNELS.workspaceChangedEvent, workspace)
      return workspace
    })
    ipcMain.handle(IPC_CHANNELS.courseProgressGet, async (_event, workspaceId: unknown) => {
      if (typeof workspaceId !== 'string') throw new Error('WORKSPACE_ID_INVALID')
      if (!courseProgress) throw new Error('COURSE_PROGRESS_SERVICE_UNAVAILABLE')
      const context = await getCourseProgressContext(workspaceId)
      return courseProgress.get(context.workspace, context.lesson, context.files)
    })
    ipcMain.handle(IPC_CHANNELS.courseProgressUpdate, async (_event, workspaceId: unknown, update: unknown) => {
      if (typeof workspaceId !== 'string' || !update || typeof update !== 'object') throw new Error('COURSE_PROGRESS_UPDATE_INVALID')
      if (!courseProgress || !courses) throw new Error('COURSE_PROGRESS_SERVICE_UNAVAILABLE')
      const context = await getCourseProgressContext(workspaceId)
      return courseProgress.update(context.workspace, context.lesson, update as never, context.files)
    })
  }
  if (candidates) {
    const withCandidateEvent = async (operation: () => Promise<unknown>): Promise<unknown> => {
      const candidate = await operation()
      sendToAll(IPC_CHANNELS.candidateChangedEvent, candidate)
      return candidate
    }
    ipcMain.handle(IPC_CHANNELS.candidateCreate, (_event, workspaceId: unknown) => {
      if (typeof workspaceId !== 'string') throw new Error('WORKSPACE_ID_INVALID')
      return withCandidateEvent(() => candidates.create(workspaceId))
    })
    ipcMain.handle(IPC_CHANNELS.studentFilesList, (_event, workspaceId: unknown, candidateId: unknown) => {
      if (typeof workspaceId !== 'string' || (candidateId !== undefined && typeof candidateId !== 'string')) throw new Error('STUDENT_FILES_INPUT_INVALID')
      return candidates.listStudentCodeFiles(workspaceId, candidateId as string | undefined)
    })
    if (projectExplorer && edition.id !== 'fun-line-following') {
      ipcMain.handle(IPC_CHANNELS.projectExplorerGet, (_event, workspaceId: unknown, candidateId: unknown) => {
        if (typeof workspaceId !== 'string' || (candidateId !== undefined && typeof candidateId !== 'string')) throw new Error('PROJECT_EXPLORER_INPUT_INVALID')
        return projectExplorer.getSnapshot(workspaceId, candidateId as string | undefined)
      })
      ipcMain.handle(IPC_CHANNELS.projectExplorerFileRead, (_event, workspaceId: unknown, nodeId: unknown, candidateId: unknown) => {
        if (typeof workspaceId !== 'string' || typeof nodeId !== 'string' || (candidateId !== undefined && typeof candidateId !== 'string')) throw new Error('PROJECT_EXPLORER_INPUT_INVALID')
        return projectExplorer.readFile(workspaceId, nodeId, candidateId as string | undefined)
      })
      ipcMain.handle(IPC_CHANNELS.workspaceFileWrite, async (_event, workspaceId: unknown, path: unknown, content: unknown) => {
        if (typeof workspaceId !== 'string' || typeof path !== 'string' || typeof content !== 'string') throw new Error('WORKSPACE_FILE_INPUT_INVALID')
        const workspace = await candidates.writeWorkspaceFile(workspaceId, path as never, content)
        await recordCourseSourceChange(workspaceId, 'workspace-edited', [path])
        sendToAll(IPC_CHANNELS.workspaceChangedEvent, workspace)
        return workspace
      })
    }
    ipcMain.handle(IPC_CHANNELS.manualDraftOpen, (_event, workspaceId: unknown) => {
      if (typeof workspaceId !== 'string') throw new Error('WORKSPACE_ID_INVALID')
      return withCandidateEvent(() => candidates.openManualDraft(workspaceId))
    })
    ipcMain.handle(IPC_CHANNELS.manualDraftWrite, (_event, candidateId: unknown, path: unknown, content: unknown) => {
      if (typeof candidateId !== 'string' || typeof path !== 'string' || typeof content !== 'string') throw new Error('MANUAL_DRAFT_INPUT_INVALID')
      return withCandidateEvent(() => candidates.writeManualDraft(candidateId, path as never, content))
    })
    ipcMain.handle(IPC_CHANNELS.candidateGet, (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      return candidates.get(candidateId)
    })
    ipcMain.handle(IPC_CHANNELS.candidateGetDiff, (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      return candidates.getDiff(candidateId)
    })
    ipcMain.handle(IPC_CHANNELS.candidateValidate, (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      return withCandidateEvent(() => candidates.validate(candidateId))
    })
    ipcMain.handle(IPC_CHANNELS.candidateBuild, async (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      const result = await withCandidateEvent(() => candidates.build(candidateId)) as CandidateSnapshot
      await recordCourseOperation(result.workspaceId, 'candidate-build', result.state === 'build_passed', result.error ?? (result.state === 'build_passed' ? '候选代码编译通过' : '候选代码编译未通过'))
      return result
    })
    ipcMain.handle(IPC_CHANNELS.candidateApply, async (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      const result = await withCandidateEvent(() => candidates.apply(candidateId)) as CandidateSnapshot
      await recordCourseSourceChange(result.workspaceId, 'candidate-applied', result.validation?.files.map((file) => file.path) ?? [])
      return result
    })
    ipcMain.handle(IPC_CHANNELS.candidateReject, (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      return withCandidateEvent(() => candidates.reject(candidateId))
    })
  }
  if (agents) {
    ipcMain.handle(IPC_CHANNELS.agentPrompt, (_event, workspaceId: unknown, message: unknown) => {
      if (typeof workspaceId !== 'string' || typeof message !== 'string') throw new Error('AGENT_PROMPT_INVALID')
      return agents.prompt(workspaceId, message)
    })
    ipcMain.handle(IPC_CHANNELS.manualDraftExplain, (_event, workspaceId: unknown, request: unknown) => {
      if (typeof workspaceId !== 'string' || !request || typeof request !== 'object') throw new Error('STUDENT_EXPLAIN_INPUT_INVALID')
      return agents.explainStudentCode(workspaceId, request)
    })
    ipcMain.handle(IPC_CHANNELS.manualDraftRepair, (_event, workspaceId: unknown, candidateId: unknown) => {
      if (typeof workspaceId !== 'string' || typeof candidateId !== 'string') throw new Error('STUDENT_REPAIR_INPUT_INVALID')
      return agents.repairStudentCode(workspaceId, candidateId)
    })
    ipcMain.handle(IPC_CHANNELS.agentCancel, (_event, turnId: unknown) => {
      if (turnId !== undefined && typeof turnId !== 'string') throw new Error('AGENT_TURN_ID_INVALID')
      return agents.cancel(turnId)
    })
    ipcMain.handle(IPC_CHANNELS.agentPermissionRespond, (_event, turnId: unknown, requestId: unknown, optionId: unknown) => {
      if (typeof turnId !== 'string' || typeof requestId !== 'string' || typeof optionId !== 'string') throw new Error('AGENT_PERMISSION_INVALID')
      return agents.respondPermission(turnId, requestId, optionId)
    })
  }
  if (agentHistory) {
    ipcMain.handle(IPC_CHANNELS.agentHistoryList, (_event, workspaceId: unknown) => {
      if (typeof workspaceId !== 'string') throw new Error('WORKSPACE_ID_INVALID')
      return agentHistory.list(workspaceId)
    })
  }
  if (agentRuntime) {
    ipcMain.handle(IPC_CHANNELS.agentRuntimeStatus, () => agentRuntimeStatus(agentRuntime))
    ipcMain.handle(IPC_CHANNELS.agentApiKeySet, async (_event, apiKey: unknown) => {
      if (typeof apiKey !== 'string') throw new Error('INVALID_API_KEY')
      await agentRuntime.secrets.set(apiKey)
      return agentRuntimeStatus(agentRuntime)
    })
    ipcMain.handle(IPC_CHANNELS.agentApiKeyClear, async () => {
      await agentRuntime.secrets.clear()
      return agentRuntimeStatus(agentRuntime)
    })
  }

  return () => {
    robot.off('status', statusListener)
    robot.off('log', logListener)
    robot.off('ccd', ccdListener)
    firmware.off('event', buildListener)
    connectivity.off('connection', connectionListener)
    connectivity.off('update', updateListener)
    recovery.off('event', recoveryListener)
    wchLink.off('event', wchLinkListener)
    agents?.off('event', agentListener)
    for (const channel of Object.values(IPC_CHANNELS)) {
      ipcMain.removeHandler(channel)
    }
  }
}

async function agentRuntimeStatus(runtime: AgentRuntimeServices): Promise<AgentRuntimeStatus> {
  const [installed, apiKeyConfigured] = await Promise.all([
    runtime.processes.verifyBinary().then(() => true, () => false),
    runtime.secrets.has()
  ])
  return {
    adapter: 'reasonix',
    version: runtime.version,
    installed,
    apiKeyConfigured,
    ready: installed && apiKeyConfigured,
    detail: !installed ? 'Reasonix 文件缺失或校验失败' : !apiKeyConfigured ? '请配置 DeepSeek API Key' : 'Reasonix ACP 已就绪'
  }
}
