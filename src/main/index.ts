import { join } from 'node:path'
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

const robot = new MockRobotService()
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
    title: 'RobotDog Studio',
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
      const preloadReady = await window.webContents.executeJavaScript('Boolean(window.robotDog)')
      console.log(preloadReady ? 'ROBOTDOG_SMOKE_OK' : 'ROBOTDOG_SMOKE_PRELOAD_MISSING')
      app.exit(preloadReady ? 0 : 1)
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
  const defaultRoot = join(app.getPath('userData'), 'managed-data')
  const rootOverride = process.env.ROBOTDOG_WORKSPACE_ROOT
  const workspaceRoot = rootOverride ? join(app.getPath('userData'), 'development', rootOverride.replace(/[^a-zA-Z0-9_-]/g, '_')) : defaultRoot
  const templateRoot = join(app.getAppPath(), 'resources', 'workspace-templates', 'ch32v203-robotdog', '2026.06')
  const baseline = new FirmwareBaselineService({
    manifestPath: join(app.getAppPath(), 'resources', 'firmware-baselines', 'ch32v203-robotdog', 'provisional-0858d82', 'robotdog.firmware.json'),
    packagedSourceRoot: app.isPackaged ? join(process.resourcesPath, 'firmware-baselines', 'ch32v203-robotdog', 'current', 'source') : undefined
  })
  const baselineManifest = await baseline.getManifest()
  const workspaces = new WorkspaceService({ rootDir: workspaceRoot, templateRoot, firmwareBaselineId: baselineManifest.id, baselineCommit: baselineManifest.source.expectedCommit })
  await workspaces.initialize()
  const toolchain = new ToolchainService()
  const candidates = new CandidateService({ rootDir: workspaceRoot, workspaces, builder: new CandidateBuildService(toolchain, join(workspaceRoot, 'build-cache')) })
  await candidates.initialize()
  const reasonixVersion = 'v1.9.1'
  const processes = new ReasonixProcessManager({
    version: reasonixVersion,
    binarySha256: '6bb152f4bd6362ee441e6ed3f8917aa6350d646b3f7c0097bb0f5cf8ee66acf5',
    binaryPath: join(app.getAppPath(), 'resources', 'tools', 'reasonix-v1.9.1', 'bin', 'reasonix.exe'),
    sessionDataRoot: join(workspaceRoot, 'reasonix-sessions')
  })
  const secrets = new DeepSeekSecretStore(join(app.getPath('userData'), 'secure', 'deepseek-api-key.bin'))
  const agentHistory = new AgentHistoryService(join(workspaceRoot, 'conversations'))
  await agentHistory.initialize()
  const agents = new AgentSessionService(candidates, new ReasonixAcpAdapter(processes, () => secrets.get()))
  const firmwareBuild = new FirmwareBuildService(toolchain, { baseline, workspaces, outputBase: join(workspaceRoot, 'firmware-artifacts') })
  await firmwareBuild.initialize()
  const runtime = { secrets, processes, version: reasonixVersion }
  const diagnostics = new DiagnosticService({
    dataRoot: workspaceRoot,
    getRuntimeInfo: async () => ({
      mode: 'simulation',
      workspaceCount: (await workspaces.list()).length,
      toolchain: await toolchain.getStatus(),
      baseline: await baseline.getStatus(),
      agent: await getAgentRuntimeStatus(runtime)
    })
  })
  disposeIpc = registerIpc(robot, toolchain, firmwareBuild, workspaces, candidates, agents, runtime, agentHistory, baseline, diagnostics)
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
