import { createHash } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { ReasonixProcessManager } from './reasonix-process-manager'

describe('ReasonixProcessManager', () => {
  it('verifies the pinned binary hash and rejects tampering', async () => {
    const root = await mkdtemp(join(tmpdir(), 'reasonix-runtime-'))
    const binaryPath = join(root, 'reasonix.exe')
    const bytes = Buffer.from('fixture-binary')
    await writeFile(binaryPath, bytes)
    const valid = new ReasonixProcessManager({ version: 'fixture', binaryPath, binarySha256: createHash('sha256').update(bytes).digest('hex') })
    await expect(valid.verifyBinary()).resolves.toBeUndefined()
    const invalid = new ReasonixProcessManager({ version: 'fixture', binaryPath, binarySha256: '0'.repeat(64) })
    await expect(invalid.verifyBinary()).rejects.toThrow('REASONIX_HASH_MISMATCH')
  })
})
