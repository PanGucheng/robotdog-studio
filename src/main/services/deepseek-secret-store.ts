import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { safeStorage } from 'electron'

export class DeepSeekSecretStore {
  constructor(private readonly filePath: string) {}

  async has(): Promise<boolean> {
    return readFile(this.filePath).then((value) => value.length > 0, () => false)
  }

  async set(apiKey: string): Promise<void> {
    const value = apiKey.trim()
    if (!/^sk-[A-Za-z0-9_-]{8,}$/.test(value)) throw new Error('INVALID_API_KEY')
    if (!safeStorage.isEncryptionAvailable()) throw new Error('SAFE_STORAGE_UNAVAILABLE')
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, safeStorage.encryptString(value))
  }

  async get(): Promise<string> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('SAFE_STORAGE_UNAVAILABLE')
    return safeStorage.decryptString(await readFile(this.filePath))
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true })
  }
}
