import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/channels'
import type { AgentRuntimeStatus, AppHealth } from '../../shared/types'
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

export interface AgentRuntimeServices { secrets: DeepSeekSecretStore; processes: ReasonixProcessManager; version: string }

export function registerIpc(robot: MockRobotService, toolchain = new ToolchainService(), firmware = new FirmwareBuildService(toolchain), workspaces?: WorkspaceService, candidates?: CandidateService, agents?: AgentSessionService, agentRuntime?: AgentRuntimeServices, agentHistory?: AgentHistoryService): () => void {
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
  const updateListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.firmwareUpdateEvent, payload)
  const recoveryListener = (payload: unknown): void => sendToAll(IPC_CHANNELS.recoveryEvent, payload)
  const agentListener = (payload: unknown): void => {
    if (agentHistory) void agentHistory.append(payload as import('../../shared/types').AgentEvent)
    sendToAll(IPC_CHANNELS.agentEvent, payload)
  }

  robot.on('status', statusListener)
  robot.on('log', logListener)
  robot.on('ccd', ccdListener)
  firmware.on('event', buildListener)
  connectivity.on('connection', connectionListener)
  connectivity.on('update', updateListener)
  recovery.on('event', recoveryListener)
  agents?.on('event', agentListener)

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
  ipcMain.handle(IPC_CHANNELS.robotStatusGet, () => robot.getStatus())
  ipcMain.handle(IPC_CHANNELS.robotConnectDemo, () => robot.connectDemo())
  ipcMain.handle(IPC_CHANNELS.robotDisconnect, () => robot.disconnect())
  ipcMain.handle(IPC_CHANNELS.robotActionRun, (_event, action: unknown) => robot.runAction(action))
  ipcMain.handle(IPC_CHANNELS.robotCcdCapture, () => robot.captureCcd())
  ipcMain.handle(IPC_CHANNELS.firmwareToolchainStatus, () => toolchain.getStatus())
  ipcMain.handle(IPC_CHANNELS.firmwareBuildStart, () => firmware.build())
  ipcMain.handle(IPC_CHANNELS.firmwareBuildCancel, () => firmware.cancel())
  ipcMain.handle(IPC_CHANNELS.deviceConnectionGet, () => connectivity.getConnection())
  ipcMain.handle(IPC_CHANNELS.simulationUsbSet, (_event, connected: unknown) => {
    if (typeof connected !== 'boolean') throw new Error('USB 模拟状态必须是布尔值')
    return connectivity.setUsbConnected(connected)
  })
  ipcMain.handle(IPC_CHANNELS.firmwareUpdateGet, () => connectivity.getUpdate())
  ipcMain.handle(IPC_CHANNELS.firmwareUpdateStart, () => {
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(recovery.getSnapshot().state)) throw new Error('教师恢复进行中，不能同时下载学生固件')
    const build = firmware.getSnapshot()
    if (build.state !== 'completed') throw new Error('请先完成固件编译')
    const binary = build.artifacts.find((artifact) => artifact.kind === 'bin')
    if (!binary) throw new Error('编译产物中没有 BIN 固件')
    return connectivity.startUpdate(binary)
  })
  ipcMain.handle(IPC_CHANNELS.firmwareUpdateCancel, () => connectivity.cancelUpdate())
  ipcMain.handle(IPC_CHANNELS.recoveryGet, () => recovery.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.recoveryStart, () => {
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(connectivity.getUpdate().state)) throw new Error('学生固件下载进行中，不能同时执行教师恢复')
    return recovery.start()
  })
  ipcMain.handle(IPC_CHANNELS.recoveryCancel, () => recovery.cancel())
  if (workspaces) {
    ipcMain.handle(IPC_CHANNELS.workspaceList, () => workspaces.list())
    ipcMain.handle(IPC_CHANNELS.workspaceCreate, async (_event, input: unknown) => {
      const workspace = await workspaces.create(input as never)
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
      sendToAll(IPC_CHANNELS.workspaceChangedEvent, workspace)
      return workspace
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
    ipcMain.handle(IPC_CHANNELS.candidateBuild, (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      return withCandidateEvent(() => candidates.build(candidateId))
    })
    ipcMain.handle(IPC_CHANNELS.candidateApply, (_event, candidateId: unknown) => {
      if (typeof candidateId !== 'string') throw new Error('CANDIDATE_ID_INVALID')
      return withCandidateEvent(() => candidates.apply(candidateId))
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
