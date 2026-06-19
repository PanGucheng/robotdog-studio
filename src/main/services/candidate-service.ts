import { createHash, randomBytes } from 'node:crypto'
import { access, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { CandidateDiff, CandidateSnapshot, CandidateState, PatchValidationReport } from '../../shared/types'
import { GitWorkspaceService } from './git-workspace-service'
import { PatchPolicyService } from './patch-policy-service'
import { SourceFingerprintService } from './source-fingerprint-service'
import { WorkspaceService } from './workspace-service'

const candidateIdSchema = z.string().regex(/^cand_[a-f0-9]{24}$/)
const candidateStateSchema = z.enum([
  'preparing', 'agent_running', 'validating', 'review_ready', 'no_changes', 'building', 'build_passed',
  'awaiting_apply', 'applying', 'applied', 'rejected', 'cancelled', 'failed', 'stale', 'conflict'
])
const candidateSchema = z.object({
  id: candidateIdSchema,
  workspaceId: z.string().regex(/^ws_[a-f0-9]{24}$/),
  state: candidateStateSchema,
  baseCommit: z.string().regex(/^[a-f0-9]{40}$/),
  baseTreeHash: z.string().regex(/^[a-f0-9]{64}$/),
  policyVersion: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sourceTreeHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  diffHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  validation: z.custom<PatchValidationReport>().optional(),
  error: z.string().max(500).optional()
}).strict()

const activeStates = new Set<CandidateState>(['preparing', 'agent_running', 'validating', 'review_ready', 'building', 'build_passed', 'awaiting_apply'])

export interface CandidateServiceOptions {
  rootDir: string
  workspaces: WorkspaceService
  git?: GitWorkspaceService
  policy?: PatchPolicyService
  fingerprint?: SourceFingerprintService
  lifetimeMs?: number
}

export class CandidateService {
  private readonly candidatesDir: string
  private readonly workspaces: WorkspaceService
  private readonly git: GitWorkspaceService
  private readonly policy: PatchPolicyService
  private readonly fingerprint: SourceFingerprintService
  private readonly lifetimeMs: number

  constructor(options: CandidateServiceOptions) {
    this.candidatesDir = resolve(options.rootDir, 'candidates')
    this.workspaces = options.workspaces
    this.git = options.git ?? new GitWorkspaceService()
    this.policy = options.policy ?? new PatchPolicyService(this.git)
    this.fingerprint = options.fingerprint ?? new SourceFingerprintService()
    this.lifetimeMs = options.lifetimeMs ?? 2 * 60 * 60 * 1000
  }

  async initialize(): Promise<void> {
    await mkdir(this.candidatesDir, { recursive: true })
    await this.reconcile()
  }

  async create(workspaceId: string): Promise<CandidateSnapshot> {
    await mkdir(this.candidatesDir, { recursive: true })
    const workspace = await this.workspaces.get(workspaceId)
    if (workspace.activeCandidateId || workspace.state === 'candidate_active') throw new Error('WORKSPACE_CANDIDATE_ACTIVE')
    const projectRoot = await this.workspaces.getProjectRootForMain(workspaceId)
    if (!(await this.git.isClean(projectRoot))) throw new Error('WORKSPACE_DIRTY')
    const baseCommit = await this.git.getHead(projectRoot)
    const baseTreeHash = await this.fingerprint.calculate(projectRoot)
    const id = `cand_${randomBytes(12).toString('hex')}`
    const candidateRoot = this.candidateRoot(id)
    const now = new Date()
    let worktreeCreated = false
    try {
      await this.git.addDetachedWorktree(projectRoot, candidateRoot, baseCommit)
      worktreeCreated = true
      const snapshot: CandidateSnapshot = {
        id,
        workspaceId,
        state: 'agent_running',
        baseCommit,
        baseTreeHash,
        policyVersion: 'student-v1:1',
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + this.lifetimeMs).toISOString(),
        updatedAt: now.toISOString()
      }
      await this.writeSnapshot(snapshot)
      await this.workspaces.setCandidateState(workspaceId, 'candidate_active', id)
      return structuredClone(snapshot)
    } catch (caught) {
      if (worktreeCreated) await this.git.removeWorktree(projectRoot, candidateRoot).catch(() => undefined)
      throw caught
    }
  }

  async get(candidateId: string): Promise<CandidateSnapshot> {
    candidateIdSchema.parse(candidateId)
    return structuredClone(candidateSchema.parse(JSON.parse(await readFile(this.metadataPath(candidateId), 'utf8'))))
  }

  async validate(candidateId: string): Promise<CandidateSnapshot> {
    let snapshot = await this.get(candidateId)
    if (!activeStates.has(snapshot.state)) throw new Error('CANDIDATE_NOT_ACTIVE')
    if (Date.parse(snapshot.expiresAt) <= Date.now()) return this.finish(snapshot, 'stale', '候选修改已过期，请重新生成。', true)
    const projectRoot = await this.workspaces.getProjectRootForMain(snapshot.workspaceId)
    if ((await this.git.getHead(projectRoot)) !== snapshot.baseCommit || !(await this.git.isClean(projectRoot))) {
      return this.finish(snapshot, 'stale', '正式项目已经变化，请重新生成候选修改。', true)
    }
    snapshot = await this.update(snapshot, { state: 'validating', error: undefined })
    try {
      const validation = await this.policy.validate(this.candidateRoot(candidateId))
      const sourceTreeHash = await this.fingerprint.calculate(this.candidateRoot(candidateId))
      const diffHash = createHash('sha256').update(JSON.stringify({ files: validation.files, sourceTreeHash })).digest('hex')
      const state: CandidateState = validation.files.length === 0 ? 'no_changes' : validation.valid ? 'review_ready' : 'failed'
      const error = validation.valid ? undefined : validation.violations.map((item) => item.message).join('；').slice(0, 500)
      return this.update(snapshot, { state, validation, sourceTreeHash, diffHash, error })
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught)
      return this.update(snapshot, { state: 'failed', error: error.slice(0, 500) })
    }
  }

  async getDiff(candidateId: string): Promise<CandidateDiff> {
    const snapshot = await this.validate(candidateId)
    if (!snapshot.validation?.valid || !snapshot.diffHash || !['review_ready', 'no_changes'].includes(snapshot.state)) throw new Error('CANDIDATE_DIFF_NOT_READY')
    const candidateRoot = this.candidateRoot(candidateId)
    const files = await Promise.all(snapshot.validation.files.map(async (file) => ({
      path: file.path,
      status: file.status,
      before: file.status === 'added' ? '' : await this.git.headFileText(candidateRoot, file.path),
      after: file.status === 'deleted' ? '' : await readFile(join(candidateRoot, ...file.path.split('/')), 'utf8'),
      additions: file.additions,
      deletions: file.deletions
    })))
    return { candidateId, diffHash: snapshot.diffHash, files }
  }

  async reject(candidateId: string): Promise<CandidateSnapshot> {
    const snapshot = await this.get(candidateId)
    if (!activeStates.has(snapshot.state) && snapshot.state !== 'failed' && snapshot.state !== 'no_changes') throw new Error('CANDIDATE_NOT_REJECTABLE')
    return this.finish(snapshot, 'rejected', undefined, true)
  }

  async reconcile(): Promise<void> {
    await mkdir(this.candidatesDir, { recursive: true })
    const workspaces = await this.workspaces.list()
    for (const workspace of workspaces) {
      const candidateId = workspace.activeCandidateId
      if (!candidateId || await exists(this.metadataPath(candidateId))) continue
      const candidateRoot = this.candidateRoot(candidateId)
      if (await exists(candidateRoot)) {
        const projectRoot = await this.workspaces.getProjectRootForMain(workspace.id)
        await this.git.removeWorktree(projectRoot, candidateRoot)
      }
      await this.workspaces.setCandidateState(workspace.id, 'ready')
    }
    const entries = await readdir(this.candidatesDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !/^cand_[a-f0-9]{24}\.json$/.test(entry.name)) continue
      try {
        const snapshot = await this.get(entry.name.slice(0, -5))
        if (activeStates.has(snapshot.state) && Date.parse(snapshot.expiresAt) <= Date.now()) {
          await this.finish(snapshot, 'stale', '候选修改在应用关闭期间过期。', true)
        }
      } catch {
        // Damaged metadata is left untouched for diagnostics and is never exposed.
      }
    }
  }

  private async finish(snapshot: CandidateSnapshot, state: CandidateState, error?: string, removeWorktree = false): Promise<CandidateSnapshot> {
    if (removeWorktree && await exists(this.candidateRoot(snapshot.id))) {
      const projectRoot = await this.workspaces.getProjectRootForMain(snapshot.workspaceId)
      await this.git.removeWorktree(projectRoot, this.candidateRoot(snapshot.id))
    }
    const updated = await this.update(snapshot, { state, error })
    const workspace = await this.workspaces.get(snapshot.workspaceId)
    if (workspace.activeCandidateId === snapshot.id) await this.workspaces.setCandidateState(snapshot.workspaceId, 'ready')
    return updated
  }

  private async update(snapshot: CandidateSnapshot, patch: Partial<CandidateSnapshot>): Promise<CandidateSnapshot> {
    const updated = candidateSchema.parse({ ...snapshot, ...patch, updatedAt: new Date().toISOString() })
    await this.writeSnapshot(updated)
    return structuredClone(updated)
  }

  private async writeSnapshot(snapshot: CandidateSnapshot): Promise<void> {
    const path = this.metadataPath(snapshot.id)
    const temporaryPath = `${path}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, path)
  }

  private candidateRoot(candidateId: string): string {
    candidateIdSchema.parse(candidateId)
    return join(this.candidatesDir, candidateId)
  }

  private metadataPath(candidateId: string): string {
    candidateIdSchema.parse(candidateId)
    return join(this.candidatesDir, `${candidateId}.json`)
  }
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false)
}
