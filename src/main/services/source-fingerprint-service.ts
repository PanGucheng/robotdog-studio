import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

const excludedDirectories = new Set(['.git', '.reasonix', 'build', 'build-cache', 'debug', 'release'])
const excludedFiles = new Set(['workspace.json'])

export class SourceFingerprintService {
  async calculate(root: string): Promise<string> {
    const files: string[] = []
    await this.collect(root, root, files)
    files.sort((left, right) => left.localeCompare(right, 'en-US'))
    const hash = createHash('sha256')
    for (const path of files) {
      hash.update(path.toLocaleLowerCase('en-US'))
      hash.update('\0')
      hash.update(await readFile(join(root, ...path.split('/'))))
      hash.update('\0')
    }
    return hash.digest('hex')
  }

  private async collect(root: string, directory: string, files: string[]): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('SOURCE_LINK_DENIED')
      const fullPath = join(directory, entry.name)
      const relativePath = relative(root, fullPath).replaceAll('\\', '/')
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name.toLocaleLowerCase('en-US'))) await this.collect(root, fullPath, files)
      } else if (entry.isFile() && !excludedFiles.has(entry.name.toLocaleLowerCase('en-US')) && !entry.name.endsWith('.tmp')) {
        const info = await lstat(fullPath)
        if (info.size > 4 * 1024 * 1024) throw new Error('SOURCE_FILE_TOO_LARGE')
        files.push(relativePath)
      }
    }
  }
}

