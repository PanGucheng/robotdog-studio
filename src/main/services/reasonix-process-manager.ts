import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AcpClient } from './acp-client'

export interface ReasonixRuntimeManifest {
  version: string
  binarySha256: string
  binaryPath: string
  sessionDataRoot?: string
}

export type ReasonixRuntimeProfile = 'economy' | 'balanced' | 'delivery'

export interface ReasonixProcess {
  client: AcpClient
  stderr: () => string
  stop: () => Promise<void>
}

export class ReasonixProcessManager {
  constructor(private readonly runtime: ReasonixRuntimeManifest) {}

  async start(cwd: string, apiKey: string, profileId?: string, runtimeProfile: ReasonixRuntimeProfile = 'balanced'): Promise<ReasonixProcess> {
    await this.verifyBinary()
    if (!isReasonixRuntimeProfile(runtimeProfile)) throw new Error('REASONIX_PROFILE_INVALID')
    const persistent = Boolean(profileId && this.runtime.sessionDataRoot)
    if (profileId && !/^ws_[a-f0-9]{24}$/.test(profileId)) throw new Error('REASONIX_SESSION_PROFILE_INVALID')
    const runtimeHome = await mkdtemp(join(tmpdir(), 'robotdog-reasonix-home-'))
    const stateHome = persistent ? join(this.runtime.sessionDataRoot!, profileId!) : runtimeHome
    await mkdir(stateHome, { recursive: true })
    await this.writeRuntimeHome(runtimeHome, apiKey)
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(this.runtime.binaryPath, ['acp', '-profile', runtimeProfile], {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: this.safeEnvironment(runtimeHome, stateHome)
      })
      await waitForSpawn(child)
    } catch (error) {
      await rm(runtimeHome, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr = redact(`${stderr}${chunk}`, apiKey).slice(-16_000) })
    const client = new AcpClient(child.stdin, child.stdout, 60_000)
    return {
      client,
      stderr: () => stderr,
      stop: async () => {
        client.close()
        if (child.exitCode === null) {
          child.kill()
          await Promise.race([waitForExit(child), new Promise<void>((resolve) => setTimeout(resolve, 2_000))])
          if (child.exitCode === null) child.kill('SIGKILL')
        }
        await rm(runtimeHome, { recursive: true, force: true }).catch(() => undefined)
        if (!persistent) await rm(stateHome, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  }

  async verifyBinary(): Promise<void> {
    const bytes = await readFile(this.runtime.binaryPath).catch(() => { throw new Error('REASONIX_NOT_INSTALLED') })
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (hash !== this.runtime.binarySha256.toLowerCase()) throw new Error('REASONIX_HASH_MISMATCH')
  }

  private async writeRuntimeHome(runtimeHome: string, apiKey: string): Promise<void> {
    if (/[\r\n]/.test(apiKey)) throw new Error('REASONIX_API_KEY_INVALID')
    await writeFile(join(runtimeHome, 'config.toml'), userConfig, 'utf8')
    await writeFile(join(runtimeHome, '.env'), `DEEPSEEK_API_KEY=${apiKey}\n`, 'utf8')
  }

  private safeEnvironment(runtimeHome: string, stateHome: string): NodeJS.ProcessEnv {
    const keep = ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT']
    const env: NodeJS.ProcessEnv = {
      ROBOTDOG_REASONIX_VERSION: this.runtime.version,
      REASONIX_HOME: runtimeHome,
      REASONIX_STATE_HOME: stateHome,
      HOME: runtimeHome,
      USERPROFILE: runtimeHome,
      APPDATA: join(runtimeHome, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(runtimeHome, 'AppData', 'Local')
    }
    for (const key of keep) if (process.env[key]) env[key] = process.env[key]
    return env
  }
}

const userConfig = `config_version = 1
default_model = "deepseek/deepseek-chat"
language = "zh"

[agent]
auto_plan = "off"
max_steps = 0

[[providers]]
name = "deepseek"
kind = "openai"
base_url = "https://api.deepseek.com"
models = ["deepseek-chat", "deepseek-reasoner"]
default = "deepseek-chat"
api_key_env = "DEEPSEEK_API_KEY"
`

function isReasonixRuntimeProfile(value: string): value is ReasonixRuntimeProfile {
  return value === 'economy' || value === 'balanced' || value === 'delivery'
}

function waitForSpawn(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => child.once('exit', () => resolve()))
}

function redact(text: string, secret: string): string {
  let value = secret ? text.split(secret).join('[REDACTED]') : text
  value = value.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
  return value
}
