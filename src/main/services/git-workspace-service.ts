import { execFile } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import type { WorkspaceHistoryEntry } from '../../shared/types'

const execFileAsync = promisify(execFile)
const MANAGED_MARKER = '.robotdog-managed'

export class GitWorkspaceService {
  async initialize(projectRoot: string): Promise<string> {
    const root = resolve(projectRoot)
    await this.run(root, ['init', '--initial-branch=main'])
    await this.run(root, ['add', '--all'])
    await this.run(root, [
      '-c', 'user.name=RobotDog Studio',
      '-c', 'user.email=studio@robotdog.local',
      'commit', '-m', 'chore: initialize student workspace'
    ])
    return this.getHead(root)
  }

  async getHead(projectRoot: string): Promise<string> {
    await this.assertManagedRepository(projectRoot)
    return (await this.run(projectRoot, ['rev-parse', 'HEAD'])).trim()
  }

  async history(projectRoot: string, limit = 20): Promise<WorkspaceHistoryEntry[]> {
    await this.assertManagedRepository(projectRoot)
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
    const output = await this.run(projectRoot, ['log', `--max-count=${safeLimit}`, '--format=%H%x1f%h%x1f%s%x1f%cI'])
    return output.split(/\r?\n/).filter(Boolean).map((line) => {
      const [commit, shortCommit, message, createdAt] = line.split('\x1f')
      return { commit, shortCommit, message, createdAt }
    })
  }

  async assertManagedRepository(projectRoot: string): Promise<void> {
    const root = resolve(projectRoot)
    const marker = await readFile(resolve(root, MANAGED_MARKER), 'utf8').catch(() => '')
    if (marker.trim() !== 'RobotDog Studio workspace v1') throw new Error('WORKSPACE_NOT_MANAGED')
    const reportedRoot = (await this.run(root, ['rev-parse', '--show-toplevel'])).trim()
    const [actualRoot, actualReportedRoot] = await Promise.all([realpath(root), realpath(reportedRoot)])
    if (actualReportedRoot.toLocaleLowerCase('en-US') !== actualRoot.toLocaleLowerCase('en-US')) {
      throw new Error('WORKSPACE_REPOSITORY_MISMATCH')
    }
  }

  private async run(cwd: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: resolve(cwd),
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      return stdout
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught)
      throw new Error(`WORKSPACE_GIT_FAILED: ${detail}`)
    }
  }
}
