import type { AgentEvent, AgentEventPayload, AgentTurnSnapshot, CandidateSnapshot, CcdFrame, DeviceConnectionSnapshot, FirmwareBuildEvent, FirmwareBuildSnapshot, FirmwareUpdateEvent, FirmwareUpdateSnapshot, LogEntry, RecoveryEvent, RecoverySnapshot, RobotAction, RobotDogApi, RobotStatus, ToolchainStatus, WorkspaceHistoryEntry, WorkspaceSummary } from '../../../shared/types'

const statusListeners = new Set<(status: RobotStatus) => void>()
const logListeners = new Set<(entry: LogEntry) => void>()
const ccdListeners = new Set<(frame: CcdFrame) => void>()
const buildListeners = new Set<(event: FirmwareBuildEvent) => void>()
const connectionListeners = new Set<(snapshot: DeviceConnectionSnapshot) => void>()
const firmwareUpdateListeners = new Set<(event: FirmwareUpdateEvent) => void>()
const recoveryListeners = new Set<(event: RecoveryEvent) => void>()
const workspaceListeners = new Set<(workspace: WorkspaceSummary) => void>()
const candidateListeners = new Set<(candidate: CandidateSnapshot) => void>()
const agentListeners = new Set<(event: AgentEvent) => void>()
const demoCandidates = new Map<string, CandidateSnapshot>()
let browserAgentToken = 0
let browserAgentTurn: AgentTurnSnapshot | undefined

let demoWorkspaces: WorkspaceSummary[] = [{
  id: 'ws_0123456789abcdef01234567', name: '巡线基础训练', studentDisplayName: '林同学',
  templateId: 'ch32v203-robotdog', templateVersion: '2026.06', firmwareBaselineId: 'ch32v203-robotdog-provisional-0858d82', baselineCommit: '0858d821d56daaea6e45740f5b496714fea20aca', createdAt: new Date().toISOString(), headCommit: '86d826a000000000000000000000000000000000',
  state: 'ready', updatedAt: new Date().toISOString()
}]
const demoHistories = new Map<string, WorkspaceHistoryEntry[]>([[demoWorkspaces[0].id, [{ commit: demoWorkspaces[0].headCommit, shortCommit: '86d826a', message: 'chore: initialize student workspace', createdAt: new Date().toISOString() }]]])

let status: RobotStatus = {
  connection: 'disconnected',
  firmware: '等待连接',
  action: 'idle',
  lineValid: false,
  lineCenter: 64,
  targetCenter: 64,
  updatedAt: new Date().toISOString()
}
let frameIndex = 0
let browserUpdateToken = 0
let browserRecoveryToken = 0

let deviceConnection: DeviceConnectionSnapshot = {
  device: { id: 'RDS-WEB-001', name: '浏览器训练小马', board: 'CH32V203 RobotDog', hardwareVersion: 'WEB-A' },
  runtime: { state: 'disconnected' },
  updatePort: { state: 'disconnected' },
  updatedAt: new Date().toISOString()
}

let firmwareUpdate: FirmwareUpdateSnapshot = {
  state: 'idle', progress: 0, bytesWritten: 0, totalBytes: 0, canCancel: false,
  message: '编译固件后，可以通过板载 USB 下载到小马。'
}

let recoverySnapshot: RecoverySnapshot = { state: 'idle', progress: 0, message: '教师恢复待命', canCancel: false }

let buildSnapshot: FirmwareBuildSnapshot = {
  state: 'idle',
  firmwareRoot: 'D:\\RobotDog\\ch32v203-robot-dog',
  completedFiles: 0,
  totalFiles: 29,
  logs: [],
  artifacts: []
}

const demoToolchainStatus: ToolchainStatus = {
  bundled: true,
  root: 'vendor\\wch',
  gcc: { ok: true, label: 'WCH GCC12', path: 'vendor\\wch\\Toolchain\\RISC-V Embedded GCC12\\bin\\riscv-wch-elf-gcc.exe', version: 'riscv-wch-elf-gcc.exe 12.2.0', detail: 'riscv-wch-elf-gcc.exe 12.2.0' },
  objcopy: { ok: true, label: 'WCH objcopy', path: 'vendor\\wch\\Toolchain\\RISC-V Embedded GCC12\\bin\\riscv-wch-elf-objcopy.exe', version: '已就绪', detail: '已就绪' },
  size: { ok: true, label: 'WCH size', path: 'vendor\\wch\\Toolchain\\RISC-V Embedded GCC12\\bin\\riscv-wch-elf-size.exe', version: '已就绪', detail: '已就绪' },
  openocd: { ok: true, label: 'WCH OpenOCD', path: 'vendor\\wch\\OpenOCD\\OpenOCD\\bin\\openocd.exe', version: 'Open On-Chip Debugger demo', detail: 'Open On-Chip Debugger demo' }
}

function update(patch: Partial<RobotStatus>): RobotStatus {
  status = { ...status, ...patch, updatedAt: new Date().toISOString() }
  statusListeners.forEach((listener) => listener({ ...status }))
  deviceConnection = {
    ...deviceConnection,
    runtime: status.connection === 'ready'
      ? { state: 'ready', port: status.port, firmware: status.firmware, latencyMs: 16 }
      : status.connection === 'connecting' ? { state: 'handshaking', port: 'WEB · BT COM8' } : { state: 'disconnected' },
    updatedAt: new Date().toISOString()
  }
  connectionListeners.forEach((listener) => listener(structuredClone(deviceConnection)))
  return { ...status }
}

function log(message: string, level: LogEntry['level'] = 'info'): void {
  const entry: LogEntry = {
    id: `${Date.now()}-${frameIndex}`,
    level,
    source: level === 'warning' ? 'safety' : 'system',
    message,
    timestamp: new Date().toISOString()
  }
  logListeners.forEach((listener) => listener(entry))
}

function emitBuild(event: FirmwareBuildEvent): void {
  buildListeners.forEach((listener) => listener(event))
}

function emitFirmwareUpdate(type: FirmwareUpdateEvent['type'], patch: Partial<FirmwareUpdateSnapshot>): void {
  firmwareUpdate = { ...firmwareUpdate, ...patch }
  firmwareUpdateListeners.forEach((listener) => listener({ type, snapshot: { ...firmwareUpdate } }))
}

function emitConnection(): void {
  deviceConnection = { ...deviceConnection, updatedAt: new Date().toISOString() }
  connectionListeners.forEach((listener) => listener(structuredClone(deviceConnection)))
}

function emitRecovery(type: RecoveryEvent['type'], patch: Partial<RecoverySnapshot>): void {
  recoverySnapshot = { ...recoverySnapshot, ...patch }
  recoveryListeners.forEach((listener) => listener({ type, snapshot: { ...recoverySnapshot } }))
}

async function runBrowserRecovery(token: number): Promise<void> {
  const steps: Array<[RecoverySnapshot['state'], number, string]> = [
    ['erasing', 18, '正在清理损坏的固件区域…'],
    ['writing_bootloader', 38, '正在恢复安全下载程序…'],
    ['writing_app', 70, '正在写入出厂应用固件…'],
    ['verifying', 88, '正在校验完整 Flash 镜像…'],
    ['resetting', 96, '校验通过，正在复位并检查启动…']
  ]
  for (const [state, progress, message] of steps) {
    await new Promise((resolve) => setTimeout(resolve, 220))
    if (token !== browserRecoveryToken) return
    emitRecovery('progress', { state, progress, message, canCancel: false })
  }
  update({ connection: 'ready', port: 'WEB · BT COM8', firmware: 'RDS1 factory-0.1', action: 'idle' })
  emitRecovery('completed', { state: 'completed', progress: 100, message: '恢复完成，Bootloader 与出厂固件均已验证', canCancel: false, completedAt: new Date().toISOString() })
}

async function runBrowserFirmwareUpdate(token: number): Promise<void> {
  const steps: Array<[FirmwareUpdateSnapshot['state'], number, string]> = [
    ['stopping', 7, '正在让小马停止并进入安全姿态…'],
    ['entering_iap', 14, '正在切换到安全下载模式…'],
    ['bootloader_handshake', 20, '已识别浏览器训练小马 · Bootloader IAP 0.1'],
    ['erasing', 28, '正在准备 APP 固件区域…'],
    ['writing', 46, '正在写入固件…'],
    ['writing', 68, '正在写入固件…'],
    ['writing', 82, '固件写入即将完成…'],
    ['verifying', 88, '正在校验整包 CRC32…'],
    ['rebooting', 94, '校验通过，正在重新启动小马…'],
    ['validating_app', 98, '正在验证新固件并恢复无线调试…']
  ]
  for (const [state, progress, message] of steps) {
    await new Promise((resolve) => setTimeout(resolve, 180))
    if (token !== browserUpdateToken) return
    if (state === 'entering_iap') update({ connection: 'disconnected', port: undefined, action: 'idle' })
    if (state === 'bootloader_handshake') {
      deviceConnection = { ...deviceConnection, updatePort: { state: 'bootloader', port: 'WEB · USB COM12', bootloaderVersion: 'IAP 0.1' } }
      emitConnection()
    }
    if (state === 'writing') {
      deviceConnection = { ...deviceConnection, updatePort: { state: 'busy', port: 'WEB · USB COM12', bootloaderVersion: 'IAP 0.1' } }
      emitConnection()
    }
    emitFirmwareUpdate('progress', { state, progress, message, canCancel: state === 'stopping', bytesWritten: Math.round((firmwareUpdate.totalBytes * progress) / 100) })
  }
  update({ connection: 'ready', port: 'WEB · BT COM8', firmware: 'RDS1 student-next', lineValid: true })
  deviceConnection = { ...deviceConnection, updatePort: { state: 'connected', port: 'WEB · USB COM12' } }
  emitConnection()
  emitFirmwareUpdate('completed', { state: 'completed', progress: 100, bytesWritten: firmwareUpdate.totalBytes, message: '下载完成，新固件已运行', canCancel: false, completedAt: new Date().toISOString() })
}

export const browserDemoApi: RobotDogApi = {
  getHealth: async () => ({ appVersion: '0.1.0', platform: 'browser', mode: 'simulation', checks: [] }),
  getRuntimeInfo: async () => ({
    dataRoot: '浏览器演示数据（不会写入磁盘）', diagnosticsRoot: '浏览器演示诊断', mode: 'simulation', workspaceCount: demoWorkspaces.length,
    toolchain: demoToolchainStatus,
    baseline: await browserDemoApi.getFirmwareBaselineStatus(),
    agent: { adapter: 'reasonix', version: 'v1.9.1', installed: true, apiKeyConfigured: true, ready: true, detail: '浏览器演示 AI 已就绪' }
  }),
  exportDiagnostics: async () => ({
    path: '浏览器演示/robotdog-diagnostics-demo.json', createdAt: new Date().toISOString(), bytes: 1024,
    included: ['应用模式与版本环境', '工具链状态', '固件基线校验', 'AI 运行时状态', '工作区数量'],
    excluded: ['API Key', '学生代码', '聊天正文', '候选修改内容', '固件二进制']
  }),
  openDataDirectory: async () => true,
  getStatus: async () => ({ ...status }),
  getToolchainStatus: async () => demoToolchainStatus,
  getFirmwareBaselineStatus: async () => ({
    id: 'ch32v203-robotdog-provisional-0858d82', label: 'CH32V203 机器马临时测试基线', sourceRoot: 'D:\\RobotDog\\ch32v203-robot-dog',
    expectedCommit: '0858d821d56daaea6e45740f5b496714fea20aca', status: 'provisional', readyForTesting: true, releaseEligible: false,
    verifiedFiles: ['Ld/Link.ld', 'Startup/startup_ch32v20x_D6.S', 'User/main.c'], errors: [],
    warnings: ['当前使用未确认的临时固件工程，只可用于功能测试，不能作为发布固件。']
  }),
  startFirmwareBuild: async (workspaceId) => {
    const workspace = await browserDemoApi.getWorkspace(workspaceId)
    buildSnapshot = {
      state: 'running',
      workspaceId,
      firmwareRoot: 'D:\\RobotDog\\ch32v203-robot-dog',
      outputDir: '.firmware-build\\demo',
      completedFiles: 0,
      totalFiles: 29,
      logs: ['浏览器演示：开始模拟编译'],
      artifacts: [],
      startedAt: new Date().toISOString()
    }
    emitBuild({ type: 'snapshot', snapshot: buildSnapshot })
    for (let index = 1; index <= 29; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 28))
      buildSnapshot = {
        ...buildSnapshot,
        completedFiles: index,
        currentFile: index < 29 ? `模拟源文件 ${index}.c` : '链接 GPIO_Toggle.elf',
        logs: [...buildSnapshot.logs.slice(-20), `[${index}/29] 模拟源文件 ${index}`]
      }
      emitBuild({ type: 'progress', snapshot: buildSnapshot })
    }
    buildSnapshot = {
      ...buildSnapshot,
      state: 'completed',
      currentFile: undefined,
      completedAt: new Date().toISOString(),
      size: { text: 27380, data: 236, bss: 3476, dec: 31092, hex: '7974' },
      artifacts: [
        { name: 'GPIO_Toggle.elf', path: '.firmware-build\\demo\\GPIO_Toggle.elf', kind: 'elf', bytes: 213592 },
        { name: 'GPIO_Toggle.hex', path: '.firmware-build\\demo\\GPIO_Toggle.hex', kind: 'hex', bytes: 77709 },
        { name: 'GPIO_Toggle.bin', path: '.firmware-build\\demo\\GPIO_Toggle.bin', kind: 'bin', bytes: 27380 }
      ],
      proof: {
        schemaVersion: 1, inputHash: '1'.repeat(64), workspaceId, workspaceCommit: workspace.headCommit, workspaceSourceHash: '2'.repeat(64),
        firmwareBaselineId: workspace.firmwareBaselineId, baselineCommit: workspace.baselineCommit, baselineSourceHash: '3'.repeat(64),
        toolchain: 'WCH GCC12 browser demo', board: 'ch32v203-robotdog-unconfirmed', size: { text: 27380, data: 236, bss: 3476, dec: 31092, hex: '7974' },
        artifacts: [], startedAt: buildSnapshot.startedAt!, completedAt: new Date().toISOString(), releaseEligible: false
      }
    }
    emitBuild({ type: 'completed', snapshot: buildSnapshot })
    return buildSnapshot
  },
  cancelFirmwareBuild: async () => {
    buildSnapshot = { ...buildSnapshot, state: 'cancelled', completedAt: new Date().toISOString(), error: '浏览器演示已取消' }
    emitBuild({ type: 'cancelled', snapshot: buildSnapshot })
    return buildSnapshot
  },
  getDeviceConnection: async () => structuredClone(deviceConnection),
  setDemoUsbConnected: async (connected) => {
    deviceConnection = { ...deviceConnection, updatePort: connected ? { state: 'connected', port: 'WEB · USB COM12' } : { state: 'disconnected' }, updatedAt: new Date().toISOString() }
    emitConnection()
    if (connected && firmwareUpdate.state === 'waiting_for_usb') void runBrowserFirmwareUpdate(browserUpdateToken)
    return structuredClone(deviceConnection)
  },
  getFirmwareUpdate: async () => ({ ...firmwareUpdate }),
  startFirmwareUpdate: async (workspaceId) => {
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(recoverySnapshot.state)) throw new Error('教师恢复进行中，不能同时下载学生固件')
    if (buildSnapshot.state !== 'completed') throw new Error('请先完成固件编译')
    const workspace = await browserDemoApi.getWorkspace(workspaceId)
    if (buildSnapshot.proof?.workspaceId !== workspace.id || buildSnapshot.proof.workspaceCommit !== workspace.headCommit) throw new Error('学生代码已经变化，请重新生成完整固件')
    const bin = buildSnapshot.artifacts.find((artifact) => artifact.kind === 'bin')
    if (!bin) throw new Error('编译产物中没有 BIN 固件')
    browserUpdateToken += 1
    firmwareUpdate = { id: `web-${Date.now()}`, state: 'preflight', artifactName: bin.name, progress: 2, bytesWritten: 0, totalBytes: bin.bytes ?? 27380, canCancel: true, message: '正在核对固件包、板型和构建身份…', targetVersion: 'RDS1 student-next', startedAt: new Date().toISOString() }
    emitFirmwareUpdate('snapshot', {})
    if (deviceConnection.updatePort.state === 'disconnected') {
      const token = browserUpdateToken
      setTimeout(() => {
        if (token === browserUpdateToken) emitFirmwareUpdate('progress', { state: 'waiting_for_usb', progress: 10, message: '请连接板载 USB 下载线', canCancel: true })
      }, 180)
    } else void runBrowserFirmwareUpdate(browserUpdateToken)
    return { ...firmwareUpdate }
  },
  cancelFirmwareUpdate: async () => {
    if (!firmwareUpdate.canCancel) throw new Error('当前正在写入关键区域，请等待当前安全步骤完成')
    browserUpdateToken += 1
    emitFirmwareUpdate('cancelled', { state: 'cancelled', message: '下载已安全取消', canCancel: false, completedAt: new Date().toISOString() })
    return { ...firmwareUpdate }
  },
  getRecovery: async () => ({ ...recoverySnapshot }),
  startRecovery: async () => {
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(firmwareUpdate.state)) throw new Error('学生固件下载进行中，不能同时执行教师恢复')
    if (!['idle', 'completed', 'failed', 'cancelled'].includes(recoverySnapshot.state)) throw new Error('已有教师恢复任务正在进行')
    browserRecoveryToken += 1
    recoverySnapshot = { state: 'preflight', progress: 4, message: '正在核对完整恢复镜像与目标板型…', imageName: 'RobotDog-Factory-Full.hex', canCancel: true, startedAt: new Date().toISOString() }
    emitRecovery('snapshot', {})
    void runBrowserRecovery(browserRecoveryToken)
    return { ...recoverySnapshot }
  },
  cancelRecovery: async () => {
    if (!recoverySnapshot.canCancel) throw new Error('完整 Flash 正在写入，请等待恢复完成')
    browserRecoveryToken += 1
    emitRecovery('cancelled', { state: 'cancelled', message: '教师恢复已安全取消', canCancel: false, completedAt: new Date().toISOString() })
    return { ...recoverySnapshot }
  },
  listWorkspaces: async () => structuredClone(demoWorkspaces),
  createWorkspace: async (input) => {
    const now = new Date()
    const baseName = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} 巡线练习`
    let name = input.name?.trim() || baseName
    for (let index = 2; demoWorkspaces.some((item) => item.name === name); index += 1) name = `${baseName}（${index}）`
    const workspace: WorkspaceSummary = {
      id: `ws_${Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24)}`,
      name, studentDisplayName: input.studentDisplayName.trim(), templateId: 'ch32v203-robotdog',
      templateVersion: '2026.06', firmwareBaselineId: 'ch32v203-robotdog-provisional-0858d82', baselineCommit: '0858d821d56daaea6e45740f5b496714fea20aca', createdAt: now.toISOString(), headCommit: 'demo000000000000000000000000000000000000', state: 'ready', updatedAt: now.toISOString()
    }
    demoWorkspaces = [workspace, ...demoWorkspaces]
    demoHistories.set(workspace.id, [{ commit: workspace.headCommit, shortCommit: workspace.headCommit.slice(0, 7), message: 'chore: initialize student workspace', createdAt: new Date().toISOString() }])
    workspaceListeners.forEach((listener) => listener(structuredClone(workspace)))
    return structuredClone(workspace)
  },
  renameWorkspace: async (workspaceId, name) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('对话名称不能为空')
    const current = await browserDemoApi.getWorkspace(workspaceId)
    const updated = { ...current, name: trimmed, updatedAt: new Date().toISOString() }
    demoWorkspaces = demoWorkspaces.map((workspace) => workspace.id === workspaceId ? updated : workspace)
    workspaceListeners.forEach((listener) => listener(structuredClone(updated)))
    return structuredClone(updated)
  },
  getWorkspace: async (workspaceId) => {
    const workspace = demoWorkspaces.find((item) => item.id === workspaceId)
    if (!workspace) throw new Error('训练项目不存在')
    return structuredClone(workspace)
  },
  getWorkspaceHistory: async (workspaceId, limit = 20) => structuredClone((demoHistories.get(workspaceId) ?? []).slice(0, limit)),
  undoWorkspace: async (workspaceId) => {
    const workspace = await browserDemoApi.getWorkspace(workspaceId)
    const history = demoHistories.get(workspaceId) ?? []
    if (history.length < 2 || !history[0].message.startsWith('feat(student): apply AI candidate ')) {
      throw new Error('没有可以撤销的 AI 修改')
    }
    const commit = Math.random().toString(16).slice(2).padEnd(40, '0').slice(0, 40)
    const reverted = { ...workspace, headCommit: commit, updatedAt: new Date().toISOString() }
    demoWorkspaces = demoWorkspaces.map((item) => item.id === workspaceId ? reverted : item)
    demoHistories.set(workspaceId, [{ commit, shortCommit: commit.slice(0, 7), message: `Revert "${history[0].message}"`, createdAt: new Date().toISOString() }, ...history])
    workspaceListeners.forEach((listener) => listener(structuredClone(reverted)))
    return structuredClone(reverted)
  },
  listStudentCodeFiles: async (_workspaceId, candidateId) => {
    const changed = candidateId && demoCandidates.get(candidateId)?.origin === 'manual'
    return [
      { path: 'Core/Src/student_control.c' as const, label: '小马怎么走', group: '控制逻辑' as const, language: 'c' as const, editable: true, content: `#include "student_control.h"\n\nvoid StudentControl_Update(const student_control_input_t *input, student_control_output_t *output)\n{\n    output->action = ${changed ? 'STUDENT_ACTION_TURN_LEFT' : 'STUDENT_ACTION_WALK'};\n}\n` },
      { path: 'student-config/line-following.yaml' as const, label: '巡线参数', group: '参数设置' as const, language: 'yaml' as const, editable: true, content: 'turn_strength: 18\nline_target: 64\n' },
      { path: 'Core/Inc/student_control.h' as const, label: '输入和动作说明', group: '参考接口' as const, language: 'c' as const, editable: false, content: '/* 这是固件提供的只读接口说明。 */\n' }
    ]
  },
  openManualDraft: async (workspaceId) => {
    const workspace = await browserDemoApi.getWorkspace(workspaceId)
    if (workspace.activeCandidateId) {
      const active = await browserDemoApi.getCandidate(workspace.activeCandidateId)
      if (active.origin === 'manual') return active
      throw new Error('请先处理当前 AI 修改')
    }
    const candidate = await browserDemoApi.createCandidate(workspaceId)
    const manual = { ...candidate, origin: 'manual' as const }
    demoCandidates.set(manual.id, manual)
    return manual
  },
  writeManualDraft: async (candidateId, path, _content) => {
    if (!['Core/Src/student_control.c', 'student-config/line-following.yaml'].includes(path)) throw new Error('参考文件不能修改')
    const candidate = await browserDemoApi.getCandidate(candidateId)
    const updated = { ...candidate, origin: 'manual' as const, state: 'agent_running' as const, updatedAt: new Date().toISOString() }
    demoCandidates.set(candidateId, updated)
    candidateListeners.forEach((listener) => listener(structuredClone(updated)))
    return structuredClone(updated)
  },
  createCandidate: async (workspaceId) => {
    const workspace = await browserDemoApi.getWorkspace(workspaceId)
    const now = new Date()
    const candidate: CandidateSnapshot = {
      id: `cand_${Math.random().toString(16).slice(2).padEnd(24, '0').slice(0, 24)}`, workspaceId, state: 'agent_running',
      baseCommit: workspace.headCommit, baseTreeHash: '0'.repeat(64), policyVersion: 'student-v1:1',
      createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 7_200_000).toISOString(), updatedAt: now.toISOString()
    }
    demoCandidates.set(candidate.id, candidate)
    demoWorkspaces = demoWorkspaces.map((item) => item.id === workspaceId ? { ...item, state: 'candidate_active', activeCandidateId: candidate.id, updatedAt: now.toISOString() } : item)
    candidateListeners.forEach((listener) => listener(structuredClone(candidate)))
    return structuredClone(candidate)
  },
  getCandidate: async (candidateId) => {
    const candidate = demoCandidates.get(candidateId)
    if (!candidate) throw new Error('候选修改不存在')
    return structuredClone(candidate)
  },
  getCandidateDiff: async (candidateId) => {
    const candidate = await browserDemoApi.getCandidate(candidateId)
    const manualFile = { path: 'Core/Src/student_control.c', status: 'modified' as const, before: 'output->action = STUDENT_ACTION_WALK;\n', after: 'output->action = STUDENT_ACTION_TURN_LEFT;\n', additions: 1, deletions: 1 }
    const aiFile = { path: 'student-config/line-following.yaml', status: 'modified' as const, before: 'turn_strength: 18\nline_target: 64\n', after: '# 减少过弯时的左右摆动\nturn_strength: 16\nline_target: 64\n', additions: 2, deletions: 1 }
    return { candidateId, diffHash: candidate.diffHash ?? '0'.repeat(64), files: ['review_ready', 'building', 'build_passed', 'awaiting_apply'].includes(candidate.state) ? [candidate.origin === 'manual' ? manualFile : aiFile] : [] }
  },
  validateCandidate: async (candidateId) => {
    const candidate = await browserDemoApi.getCandidate(candidateId)
    const files = candidate.origin === 'manual' ? [{ path: 'Core/Src/student_control.c', status: 'modified' as const, bytes: 180, additions: 1, deletions: 1 }] : []
    const validated = { ...candidate, state: candidate.origin === 'manual' ? 'review_ready' as const : 'no_changes' as const, updatedAt: new Date().toISOString(), sourceTreeHash: candidate.origin === 'manual' ? '4'.repeat(64) : candidate.baseTreeHash, diffHash: candidate.origin === 'manual' ? '5'.repeat(64) : '0'.repeat(64), validation: { valid: true, policyVersion: 'student-v1:1', files, violations: [], warnings: [], changedFiles: files.length, patchBytes: files.length ? 180 : 0 } }
    demoCandidates.set(candidateId, validated)
    candidateListeners.forEach((listener) => listener(structuredClone(validated)))
    return validated
  },
  buildCandidate: async (candidateId) => {
    const candidate = await browserDemoApi.getCandidate(candidateId)
    if (candidate.state !== 'review_ready' || !candidate.sourceTreeHash || !candidate.diffHash) throw new Error('候选尚未准备好')
    await new Promise((resolve) => setTimeout(resolve, 500))
    const built: CandidateSnapshot = { ...candidate, state: 'build_passed', updatedAt: new Date().toISOString(), error: undefined, buildProof: { candidateId, sourceTreeHash: candidate.sourceTreeHash, diffHash: candidate.diffHash, compiler: 'WCH GCC12 browser demo', objectSha256: '3'.repeat(64), completedAt: new Date().toISOString(), checks: [{ id: 'c-source', label: '学生控制代码', detail: 'WCH GCC 编译通过' }, { id: 'line-config', label: '巡线参数', detail: 'turn_strength=16，line_target=64' }] } }
    demoCandidates.set(candidateId, built)
    candidateListeners.forEach((listener) => listener(structuredClone(built)))
    return structuredClone(built)
  },
  applyCandidate: async (candidateId) => {
    const candidate = await browserDemoApi.getCandidate(candidateId)
    if (candidate.state !== 'build_passed') throw new Error('请先编译候选修改')
    const commit = Math.random().toString(16).slice(2).padEnd(40, '0').slice(0, 40)
    const applied: CandidateSnapshot = { ...candidate, state: 'applied', appliedCommit: commit, updatedAt: new Date().toISOString() }
    demoCandidates.set(candidateId, applied)
    const workspace = await browserDemoApi.getWorkspace(candidate.workspaceId)
    const ready: WorkspaceSummary = { ...workspace, state: 'ready', activeCandidateId: undefined, headCommit: commit, updatedAt: new Date().toISOString() }
    demoWorkspaces = demoWorkspaces.map((item) => item.id === ready.id ? ready : item)
    const history = demoHistories.get(ready.id) ?? []
    demoHistories.set(ready.id, [{ commit, shortCommit: commit.slice(0, 7), message: `feat(student): apply ${candidate.origin === 'manual' ? 'manual draft' : 'AI candidate'} ${candidateId.slice(5, 13)}`, createdAt: new Date().toISOString() }, ...history])
    candidateListeners.forEach((listener) => listener(structuredClone(applied)))
    workspaceListeners.forEach((listener) => listener(structuredClone(ready)))
    return structuredClone(applied)
  },
  rejectCandidate: async (candidateId) => {
    const candidate = await browserDemoApi.getCandidate(candidateId)
    const rejected = { ...candidate, state: 'rejected' as const, updatedAt: new Date().toISOString() }
    demoCandidates.set(candidateId, rejected)
    demoWorkspaces = demoWorkspaces.map((item) => item.id === candidate.workspaceId ? { ...item, state: 'ready', activeCandidateId: undefined, updatedAt: new Date().toISOString() } : item)
    candidateListeners.forEach((listener) => listener(structuredClone(rejected)))
    return rejected
  },
  explainStudentCode: async (workspaceId, request) => {
    if (browserAgentTurn) throw new Error('AI 助教正在处理上一条消息')
    const displayMessage = request.kind === 'selection' ? '请解释我选中的代码' : '请解释刚才的编译错误'
    const turn: AgentTurnSnapshot = { turnId: `turn_explain_${Date.now()}`, workspaceId, candidateId: request.candidateId, state: 'preparing', message: displayMessage, startedAt: new Date().toISOString() }
    browserAgentTurn = turn
    emitBrowserAgent(turn, 1, { type: 'turn_started', workspaceId, candidateId: request.candidateId, message: displayMessage })
    const answer = request.kind === 'selection'
      ? '这段代码会根据巡线传感器看到的黑线位置，决定让小马往左、往右，还是继续向前。可以把它想成小马一边看路，一边轻轻调整方向。'
      : '这条错误表示编译器在标出的那一行没有认出完整的 C 语句。先检查上一行是否漏了分号 `;`，再看看括号是否成对。'
    setTimeout(() => emitBrowserAgent(turn, 2, { type: 'assistant_delta', text: answer }), 120)
    setTimeout(() => { emitBrowserAgent(turn, 3, { type: 'completed', state: 'no_changes', message: request.kind === 'selection' ? '代码讲解完成，项目没有被 AI 修改。' : '错误解释完成，安全草稿没有被 AI 修改。' }); browserAgentTurn = undefined }, 260)
    return { ...turn }
  },
  promptAgent: async (workspaceId, message) => {
    if (browserAgentTurn) throw new Error('AI 助教正在处理上一条消息')
    const candidate = await browserDemoApi.createCandidate(workspaceId)
    const turn: AgentTurnSnapshot = { turnId: `turn_${Date.now()}`, workspaceId, candidateId: candidate.id, state: 'preparing', message: message.trim(), startedAt: new Date().toISOString() }
    browserAgentTurn = turn
    browserAgentToken += 1
    void runBrowserAgent(turn, browserAgentToken)
    return { ...turn }
  },
  cancelAgent: async (turnId) => {
    if (!browserAgentTurn || (turnId && browserAgentTurn.turnId !== turnId)) return false
    const turn = browserAgentTurn
    browserAgentToken += 1
    browserAgentTurn = undefined
    emitBrowserAgent(turn, 99, { type: 'cancelled', message: '已停止这次修改，正式项目没有变化。' })
    return true
  },
  respondAgentPermission: async () => true,
  listAgentHistory: async () => [],
  getAgentRuntimeStatus: async () => ({ adapter: 'mock', version: 'browser-demo', installed: true, apiKeyConfigured: true, ready: true, detail: '浏览器演示使用模拟 AI' }),
  setAgentApiKey: async () => ({ adapter: 'mock', version: 'browser-demo', installed: true, apiKeyConfigured: true, ready: true, detail: '浏览器演示不保存 API Key' }),
  clearAgentApiKey: async () => ({ adapter: 'mock', version: 'browser-demo', installed: true, apiKeyConfigured: true, ready: true, detail: '浏览器演示不保存 API Key' }),
  connectDemo: async () => {
    update({ connection: 'connecting' })
    await new Promise((resolve) => setTimeout(resolve, 280))
    log('PONG · 浏览器模拟设备已连接', 'success')
    return update({ connection: 'ready', port: 'SIM · COM8', firmware: 'RDS1 demo-0.1', lineValid: true })
  },
  disconnect: async () => update({ connection: 'disconnected', port: undefined, firmware: '等待连接', action: 'idle' }),
  runAction: async (action: RobotAction) => {
    if (status.connection !== 'ready') throw new Error('请先连接机器马')
    log(action === 'stop' ? 'STOP · 已发送软件急停' : `ACTION · ${action}`, action === 'stop' ? 'warning' : 'info')
    return update({ action: action === 'stop' ? 'idle' : action })
  },
  captureCcd: async () => {
    if (status.connection !== 'ready') throw new Error('请先连接机器马')
    frameIndex += 1
    const center = 68 + Math.round(Math.sin(frameIndex * 0.65) * 7)
    const frame: CcdFrame = {
      pixels: Array.from({ length: 128 }, (_, index) => Math.max(18, Math.round(210 - Math.exp(-Math.pow(index - center, 2) / 65) * 150))),
      threshold: 126,
      center,
      target: 64,
      valid: true,
      capturedAt: new Date().toISOString()
    }
    update({ lineCenter: center, lineValid: true })
    ccdListeners.forEach((listener) => listener(frame))
    log(`CCD · 识别到黑线，中心 ${center}`, 'success')
    return frame
  },
  onStatus: (listener) => { statusListeners.add(listener); return () => statusListeners.delete(listener) },
  onLog: (listener) => { logListeners.add(listener); return () => logListeners.delete(listener) },
  onCcd: (listener) => { ccdListeners.add(listener); return () => ccdListeners.delete(listener) },
  onFirmwareBuild: (listener) => { buildListeners.add(listener); return () => buildListeners.delete(listener) },
  onDeviceConnection: (listener) => { connectionListeners.add(listener); return () => connectionListeners.delete(listener) },
  onFirmwareUpdate: (listener) => { firmwareUpdateListeners.add(listener); return () => firmwareUpdateListeners.delete(listener) },
  onRecovery: (listener) => { recoveryListeners.add(listener); return () => recoveryListeners.delete(listener) },
  onWorkspaceChanged: (listener) => { workspaceListeners.add(listener); return () => workspaceListeners.delete(listener) },
  onCandidateChanged: (listener) => { candidateListeners.add(listener); return () => candidateListeners.delete(listener) },
  onAgentEvent: (listener) => { agentListeners.add(listener); return () => agentListeners.delete(listener) }
}

async function runBrowserAgent(turn: AgentTurnSnapshot, token: number): Promise<void> {
  const sequence = [
    { type: 'turn_started' as const, workspaceId: turn.workspaceId, candidateId: turn.candidateId, message: turn.message },
    { type: 'plan' as const, steps: [
      { id: 'inspect', label: '检查现在的巡线参数', status: 'active' as const },
      { id: 'adjust', label: '在候选副本中调整', status: 'pending' as const },
      { id: 'verify', label: '进行安全核对', status: 'pending' as const }
    ] },
    { type: 'activity' as const, label: '正在理解你的想法', state: 'thinking' as const },
    { type: 'assistant_delta' as const, text: '我先看看现在的转弯设置，' },
    { type: 'activity' as const, label: '正在准备一份可撤销的修改', state: 'editing' as const },
    { type: 'assistant_delta' as const, text: '把转弯强度从 18 调整到 16。' },
    { type: 'activity' as const, label: '正在检查修改范围和文件安全', state: 'validating' as const }
  ]
  for (let index = 0; index < sequence.length; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 140))
    if (token !== browserAgentToken) return
    emitBrowserAgent(turn, index + 1, sequence[index])
  }
  if (!turn.candidateId) return
  const current = demoCandidates.get(turn.candidateId)
  if (!current || token !== browserAgentToken) return
  const ready: CandidateSnapshot = {
    ...current, state: 'review_ready', sourceTreeHash: '1'.repeat(64), diffHash: '2'.repeat(64), updatedAt: new Date().toISOString(),
    validation: { valid: true, policyVersion: 'student-v1:1', files: [{ path: 'student-config/line-following.yaml', status: 'modified', bytes: 36, additions: 1, deletions: 1 }], violations: [], warnings: [], changedFiles: 1, patchBytes: 36 }
  }
  demoCandidates.set(ready.id, ready)
  emitBrowserAgent(turn, 8, { type: 'candidate_ready', candidate: ready, summary: '已准备好巡线参数的修改。请在右侧看看改动，再决定是否保存。' })
  emitBrowserAgent(turn, 9, { type: 'completed', state: 'review_ready', message: '修改已通过安全核对，等你查看。' })
  browserAgentTurn = undefined
}

function emitBrowserAgent(turn: AgentTurnSnapshot, sequence: number, event: AgentEventPayload): void {
  const payload = { ...event, eventId: `${turn.turnId}:${sequence}`, turnId: turn.turnId, sequence, timestamp: new Date().toISOString() } as AgentEvent
  agentListeners.forEach((listener) => listener(structuredClone(payload)))
}

export function getRobotApi(): RobotDogApi {
  return window.robotDog ?? browserDemoApi
}
