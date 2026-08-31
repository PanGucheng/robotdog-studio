import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { ReasonixProcessManager, ROBOTDOG_DEEPSEEK_MODEL_ID } from './reasonix-process-manager'

describe('ReasonixProcessManager', () => {
  it('verifies the pinned binary hash and rejects tampering', async () => {
    const root = await mkdtemp(join(tmpdir(), 'reasonix-runtime-'))
    try {
      const binaryPath = join(root, 'reasonix.exe')
      const bytes = Buffer.from('fixture-binary')
      await writeFile(binaryPath, bytes)
      const valid = new ReasonixProcessManager({ version: 'fixture', binaryPath, binarySha256: createHash('sha256').update(bytes).digest('hex') })
      await expect(valid.verifyBinary()).resolves.toBeUndefined()
      const invalid = new ReasonixProcessManager({ version: 'fixture', binaryPath, binarySha256: '0'.repeat(64) })
      await expect(invalid.verifyBinary()).rejects.toThrow('REASONIX_HASH_MISMATCH')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('starts the pinned v1.17 runtime with isolated config when the binary is prepared', async () => {
    const binaryPath = resolve('resources/tools/reasonix-v1.17.12/bin/reasonix.exe')
    await stat(binaryPath).catch(() => undefined)
    if (!(await stat(binaryPath).then(() => true, () => false))) return
    const binarySha256 = createHash('sha256').update(await readFile(binaryPath)).digest('hex')
    const projectRoot = await mkdtemp(join(tmpdir(), 'reasonix-acp-project-'))
    const stateRoot = await mkdtemp(join(tmpdir(), 'reasonix-acp-state-'))
    await writeFile(join(projectRoot, 'reasonix.toml'), '[tools]\nenabled = ["read_file"]\n', 'utf8')
    const manager = new ReasonixProcessManager({ version: 'v1.17.12', binaryPath, binarySha256, sessionDataRoot: stateRoot })
    const process = await manager.start(projectRoot, 'sk-test-placeholder', 'ws_111111111111111111111111', 'balanced')
    try {
      await expect(process.client.request('initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'robotdog-test', title: 'RobotDog Test', version: '0.0.0' }
      })).resolves.toMatchObject({ agentInfo: { version: 'v1.17.12' } })
      const session = await process.client.request<{ sessionId: string; models: { currentModelId: string; availableModels: Array<{ modelId: string }> } }>('session/new', { cwd: projectRoot, mcpServers: [] })
      expect(session).toMatchObject({
        models: {
          currentModelId: ROBOTDOG_DEEPSEEK_MODEL_ID,
          availableModels: [{ modelId: ROBOTDOG_DEEPSEEK_MODEL_ID }]
        }
      })
      await expect(process.client.request('session/set_model', {
        sessionId: session.sessionId,
        modelId: ROBOTDOG_DEEPSEEK_MODEL_ID
      })).resolves.toBeDefined()
    } finally {
      await process.stop()
      await rm(projectRoot, { recursive: true, force: true })
      await rm(stateRoot, { recursive: true, force: true })
    }
  }, 15_000)
})
