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

  async isClean(projectRoot: string): Promise<boolean> {
    await this.assertManagedRepository(projectRoot)
    return (await this.run(projectRoot, ['status', '--porcelain=v1', '--untracked-files=all'])).trim().length === 0
  }

  async addDetachedWorktree(projectRoot: string, candidateRoot: string, commit: string): Promise<void> {
    await this.assertManagedRepository(projectRoot)
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('WORKSPACE_COMMIT_INVALID')
    await this.run(projectRoot, ['worktree', 'add', '--detach', resolve(candidateRoot), commit])
  }

  async removeWorktree(projectRoot: string, candidateRoot: string): Promise<void> {
    await this.assertManagedRepository(projectRoot)
    await this.run(projectRoot, ['worktree', 'remove', '--force', resolve(candidateRoot)])
    await this.run(projectRoot, ['worktree', 'prune'])
  }

  async changedFiles(candidateRoot: string): Promise<Array<{ code: string; path: string; originalPath?: string }>> {
    await this.assertManagedRepository(candidateRoot)
    const output = await this.run(candidateRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--find-renames=50%'])
    const chunks = output.split('\0').filter(Boolean)
    const changes: Array<{ code: string; path: string; originalPath?: string }> = []
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]
      const code = chunk.slice(0, 2)
      const path = chunk.slice(3).replaceAll('\\', '/')
      if (code.includes('R') || code.includes('C')) {
        const originalPath = chunks[++index]?.replaceAll('\\', '/')
        changes.push({ code, path, originalPath })
      } else changes.push({ code, path })
    }
    return changes
  }

  async lineStats(candidateRoot: string, path: string): Promise<{ additions: number; deletions: number }> {
    await this.assertManagedRepository(candidateRoot)
    const output = await this.run(candidateRoot, ['diff', '--numstat', 'HEAD', '--', path])
    if (!output.trim()) return { additions: 0, deletions: 0 }
    const [added, deleted] = output.trim().split(/\s+/)
    return { additions: Number(added) || 0, deletions: Number(deleted) || 0 }
  }

  async headBlobHash(candidateRoot: string, path: string): Promise<string | undefined> {
    await this.assertManagedRepository(candidateRoot)
    try {
      const hash = (await this.run(candidateRoot, ['rev-parse', `HEAD:${path}`])).trim()
      return /^[a-f0-9]{40}$/.test(hash) ? hash : undefined
    } catch {
      return undefined
    }
  }

  async workingFileHash(candidateRoot: string, path: string): Promise<string | undefined> {
    await this.assertManagedRepository(candidateRoot)
    try {
      const hash = (await this.run(candidateRoot, ['hash-object', '--', path])).trim()
      return /^[a-f0-9]{40}$/.test(hash) ? hash : undefined
    } catch {
      return undefined
    }
  }

  async headFileText(candidateRoot: string, path: string): Promise<string> {
    await this.assertManagedRepository(candidateRoot)
    try {
      return await this.run(candidateRoot, ['show', `HEAD:${path}`])
    } catch {
      return ''
    }
  }

  async commitAll(projectRoot: string, message: string): Promise<string> {
    await this.assertManagedRepository(projectRoot)
    if (!message.trim() || message.length > 160) throw new Error('WORKSPACE_COMMIT_MESSAGE_INVALID')
    await this.run(projectRoot, ['add', '--all'])
    await this.run(projectRoot, [
      '-c', 'user.name=RobotDog Studio', '-c', 'user.email=studio@robotdog.local',
      'commit', '-m', message.trim()
    ])
    return this.getHead(projectRoot)
  }

  async restoreManagedChanges(projectRoot: string): Promise<void> {
    await this.assertManagedRepository(projectRoot)
    await this.run(projectRoot, ['restore', '--staged', '--worktree', '.'])
  }

  async revertHead(projectRoot: string): Promise<string> {
    await this.assertManagedRepository(projectRoot)
    const entries = await this.history(projectRoot, 2)
    if (entries.length < 2) throw new Error('WORKSPACE_NOTHING_TO_UNDO')
    if (!entries[0].message.startsWith('feat(student): apply AI candidate ')) throw new Error('WORKSPACE_NOTHING_TO_UNDO')
    await this.run(projectRoot, [
      '-c', 'user.name=RobotDog Studio', '-c', 'user.email=studio@robotdog.local',
      'revert', '--no-edit', 'HEAD'
    ])
    return this.getHead(projectRoot)
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
      const gitExecutable = process.env.ROBOTDOG_GIT_EXE || 'git'
      const { stdout } = await execFileAsync(gitExecutable, args, {
        cwd: resolve(cwd),
        windowsHide: true,
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        shell: false
      })
      return stdout
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught)
      throw new Error(`WORKSPACE_GIT_FAILED: ${detail}`)
    }
  }
}
