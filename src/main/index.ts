import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
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
      const result = await window.webContents.executeJavaScript(`(async () => {
        if (!window.robotDog) return { ok: false, reason: 'preload missing' }
        const [toolchain, baseline, runtime] = await Promise.all([
          window.robotDog.getToolchainStatus(), window.robotDog.getFirmwareBaselineStatus(), window.robotDog.getRuntimeInfo()
        ])
        const existing = await window.robotDog.listWorkspaces()
        const workspace = existing.find((item) => item.firmwareBaselineId === baseline.id && item.baselineCommit === baseline.expectedCommit)
          ?? await window.robotDog.createWorkspace({ name: '桌面包自动验证', studentDisplayName: '测试同学' })
        const firmware = await window.robotDog.startFirmwareBuild(workspace.id)
        return {
          ok: Boolean(toolchain.gcc.ok && toolchain.objcopy.ok && toolchain.size.ok && baseline.readyForTesting && runtime.agent.installed && firmware.state === 'completed' && firmware.artifacts.length === 4),
          gcc: toolchain.gcc.ok, baseline: baseline.id, baselineReady: baseline.readyForTesting,
          releaseEligible: baseline.releaseEligible, reasonixInstalled: runtime.agent.installed,
          firmwareState: firmware.state, firmwareArtifacts: firmware.artifacts.map((item) => item.kind)
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
  const defaultRoot = join(app.getPath('userData'), 'managed-data')
  const rootOverride = process.env.ROBOTDOG_WORKSPACE_ROOT
  const workspaceRoot = rootOverride ? join(app.getPath('userData'), 'development', rootOverride.replace(/[^a-zA-Z0-9_-]/g, '_')) : defaultRoot
  const staticRoot = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  if (app.isPackaged) process.env.ROBOTDOG_GIT_EXE = join(staticRoot, 'toolchains', 'git', 'cmd', 'git.exe')
  const baselineRegistry = await readBaselineRegistry(staticRoot)
  const templateRoot = join(app.isPackaged ? process.resourcesPath : app.getAppPath(), baselineRegistry.studentTemplate)
  const baseline = new FirmwareBaselineService({
    manifestPath: baselineRegistry.manifestPath,
    packagedSourceRoot: app.isPackaged && baselineRegistry.packagedSource ? join(process.resourcesPath, 'firmware-baselines', 'ch32v203-robotdog', baselineRegistry.packagedSource) : undefined
  })
  const baselineManifest = await baseline.getManifest()
  const workspaces = new WorkspaceService({ rootDir: workspaceRoot, templateRoot, templateVersion: baselineRegistry.templateVersion, firmwareBaselineId: baselineManifest.id, baselineCommit: baselineManifest.source.expectedCommit })
  await workspaces.initialize()
  const toolchain = new ToolchainService()
  const candidates = new CandidateService({ rootDir: workspaceRoot, workspaces, builder: new CandidateBuildService(toolchain, join(workspaceRoot, 'build-cache')) })
  await candidates.initialize()
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
