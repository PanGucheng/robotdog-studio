import { createHash, randomBytes } from 'node:crypto'
import { access, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import type { CandidateBuildProof, CandidateDiff, CandidateSnapshot, CandidateState, PatchValidationReport, StudentCodeFile } from '../../shared/types'
import type { CandidateBuilder } from './candidate-build-service'
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
  origin: z.enum(['ai', 'manual']).default('ai'),
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
  buildProof: z.custom<CandidateBuildProof>().optional(),
  appliedCommit: z.string().regex(/^[a-f0-9]{40}$/).optional(),
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
  builder?: CandidateBuilder
}

export class CandidateService {
  private readonly candidatesDir: string
  private readonly workspaces: WorkspaceService
  private readonly git: GitWorkspaceService
  private readonly policy: PatchPolicyService
  private readonly fingerprint: SourceFingerprintService
  private readonly lifetimeMs: number
  private readonly builder?: CandidateBuilder

  constructor(options: CandidateServiceOptions) {
    this.candidatesDir = resolve(options.rootDir, 'candidates')
    this.workspaces = options.workspaces
    this.git = options.git ?? new GitWorkspaceService()
    this.policy = options.policy ?? new PatchPolicyService(this.git)
    this.fingerprint = options.fingerprint ?? new SourceFingerprintService()
    this.lifetimeMs = options.lifetimeMs ?? 2 * 60 * 60 * 1000
    this.builder = options.builder
  }

  async initialize(): Promise<void> {
    await mkdir(this.candidatesDir, { recursive: true })
    await this.reconcile()
  }

  async create(workspaceId: string, origin: 'ai' | 'manual' = 'ai'): Promise<CandidateSnapshot> {
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
        origin,
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

  async openManualDraft(workspaceId: string): Promise<CandidateSnapshot> {
    const workspace = await this.workspaces.get(workspaceId)
    if (workspace.activeCandidateId) {
      const existing = await this.get(workspace.activeCandidateId)
      if (existing.origin === 'manual' && activeStates.has(existing.state)) return existing
      throw new Error('请先完成或放弃当前 AI 修改，再开始自己编写代码。')
    }
    return this.create(workspaceId, 'manual')
  }

  async listStudentCodeFiles(workspaceId: string, candidateId?: string): Promise<StudentCodeFile[]> {
    const workspace = await this.workspaces.get(workspaceId)
    let root = await this.workspaces.getProjectRootForMain(workspace.id)
    if (candidateId) {
      const candidate = await this.get(candidateId)
      if (candidate.workspaceId !== workspace.id) throw new Error('CANDIDATE_WORKSPACE_MISMATCH')
      root = this.candidateRoot(candidate.id)
    }
    const descriptors: Array<Omit<StudentCodeFile, 'content'>> = [
      { path: 'Core/Src/student_control.c', label: '小马怎么走', group: '控制逻辑', language: 'c', editable: true },
      { path: 'student-config/line-following.yaml', label: '巡线参数', group: '参数设置', language: 'yaml', editable: true },
      { path: 'Core/Inc/student_control.h', label: '输入和动作说明', group: '参考接口', language: 'c', editable: false }
    ]
    return Promise.all(descriptors.map(async (file) => ({ ...file, content: await readFile(join(root, ...file.path.split('/')), 'utf8') })))
  }

  async getStudentCodeContextForMain(workspaceId: string, candidateId?: string): Promise<{ root: string; policyVersion: string; files: StudentCodeFile[] }> {
    await this.workspaces.get(workspaceId)
    let root = await this.workspaces.getProjectRootForMain(workspaceId)
    let policyVersion = 'student-v1:1'
    if (candidateId) {
      const candidate = await this.get(candidateId)
      if (candidate.workspaceId !== workspaceId || candidate.origin !== 'manual') throw new Error('MANUAL_DRAFT_MISMATCH')
      root = this.candidateRoot(candidate.id)
      policyVersion = candidate.policyVersion
    }
    return { root, policyVersion, files: await this.listStudentCodeFiles(workspaceId, candidateId) }
  }

  async writeManualDraft(candidateId: string, path: StudentCodeFile['path'], content: string): Promise<CandidateSnapshot> {
    const snapshot = await this.get(candidateId)
    if (snapshot.origin !== 'manual' || !activeStates.has(snapshot.state)) throw new Error('MANUAL_DRAFT_NOT_ACTIVE')
    if (!['Core/Src/student_control.c', 'student-config/line-following.yaml'].includes(path)) throw new Error('这个参考文件只能查看，不能修改。')
    const bytes = Buffer.byteLength(content, 'utf8')
    if (bytes > 64_000 || content.includes('\0')) throw new Error('代码内容过大或包含不支持的字符。')
    const target = join(this.candidateRoot(candidateId), ...path.split('/'))
    const temporary = `${target}.manual.tmp`
    await writeFile(temporary, content, 'utf8')
    await rename(temporary, target)
    return this.update(snapshot, {
      state: 'agent_running', validation: undefined, sourceTreeHash: undefined, diffHash: undefined,
      buildProof: undefined, error: undefined
    })
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
      const diffHash = calculateDiffHash(validation, sourceTreeHash)
      const state: CandidateState = validation.files.length === 0 ? 'no_changes' : validation.valid ? 'review_ready' : 'failed'
      const error = validation.valid ? undefined : validation.violations.map((item) => item.message).join('；').slice(0, 500)
      return this.update(snapshot, { state, validation, sourceTreeHash, diffHash, buildProof: undefined, error })
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught)
      return this.update(snapshot, { state: 'failed', error: error.slice(0, 500) })
    }
  }

  async getDiff(candidateId: string): Promise<CandidateDiff> {
    const snapshot = await this.get(candidateId)
    if (!snapshot.validation?.valid || !snapshot.diffHash || !['review_ready', 'building', 'build_passed', 'awaiting_apply', 'no_changes'].includes(snapshot.state)) throw new Error('CANDIDATE_DIFF_NOT_READY')
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

  async build(candidateId: string): Promise<CandidateSnapshot> {
    let snapshot = await this.get(candidateId)
    if (snapshot.state !== 'review_ready' || !snapshot.validation?.valid || !snapshot.sourceTreeHash || !snapshot.diffHash) throw new Error('CANDIDATE_NOT_BUILDABLE')
    if (!this.builder) throw new Error('CANDIDATE_BUILDER_UNAVAILABLE')
    snapshot = await this.update(snapshot, { state: 'building', error: undefined, buildProof: undefined })
    try {
      const proof = await this.builder.build({
        candidateId, candidateRoot: this.candidateRoot(candidateId),
        sourceTreeHash: snapshot.sourceTreeHash!, diffHash: snapshot.diffHash!
      })
      const currentTreeHash = await this.fingerprint.calculate(this.candidateRoot(candidateId))
      if (currentTreeHash !== proof.sourceTreeHash || proof.diffHash !== snapshot.diffHash) throw new Error('CANDIDATE_CHANGED_DURING_BUILD')
      return this.update(snapshot, { state: 'build_passed', buildProof: proof, error: undefined })
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught)
      return this.update(snapshot, { state: 'review_ready', error: error.slice(0, 500), buildProof: undefined })
    }
  }

  async apply(candidateId: string): Promise<CandidateSnapshot> {
    let snapshot = await this.get(candidateId)
    if (snapshot.state !== 'build_passed' || !snapshot.buildProof || !snapshot.validation?.valid || !snapshot.sourceTreeHash || !snapshot.diffHash) throw new Error('CANDIDATE_NOT_APPLICABLE')
    const projectRoot = await this.workspaces.getProjectRootForMain(snapshot.workspaceId)
    if ((await this.git.getHead(projectRoot)) !== snapshot.baseCommit || !(await this.git.isClean(projectRoot))) {
      return this.finish(snapshot, 'stale', '正式项目已经变化，请重新生成候选修改。', true)
    }
    const validation = await this.policy.validate(this.candidateRoot(candidateId))
    const sourceTreeHash = await this.fingerprint.calculate(this.candidateRoot(candidateId))
    const diffHash = calculateDiffHash(validation, sourceTreeHash)
    if (!validation.valid || sourceTreeHash !== snapshot.buildProof.sourceTreeHash || diffHash !== snapshot.buildProof.diffHash) {
      return this.update(snapshot, { state: 'review_ready', buildProof: undefined, sourceTreeHash, diffHash, validation, error: '候选内容在编译后发生变化，请重新检查并编译。' })
    }

    snapshot = await this.update(snapshot, { state: 'applying', error: undefined })
    await this.workspaces.beginCandidateApply(snapshot.workspaceId, candidateId)
    const backups: Array<{ path: string; content?: Buffer }> = []
    let committed: string | undefined
    try {
      for (const file of validation.files) {
        if (file.status === 'deleted' || file.status === 'renamed') throw new Error('CANDIDATE_APPLY_UNSUPPORTED_CHANGE')
        const target = join(projectRoot, ...file.path.split('/'))
        const content = await readFile(target).catch(() => undefined)
        backups.push({ path: target, content })
        await mkdir(dirname(target), { recursive: true })
        await copyFile(join(this.candidateRoot(candidateId), ...file.path.split('/')), target)
      }
      committed = await this.git.commitAll(projectRoot, snapshot.origin === 'manual'
        ? `feat(student): apply manual draft ${candidateId.slice(5, 13)}`
        : `feat(student): apply AI candidate ${candidateId.slice(5, 13)}`)
      await this.workspaces.completeCandidateApply(snapshot.workspaceId, candidateId, committed)
      await this.git.removeWorktree(projectRoot, this.candidateRoot(candidateId)).catch(() => undefined)
      return this.update(snapshot, { state: 'applied', appliedCommit: committed, error: undefined })
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught)
      if (committed) return this.update(snapshot, { state: 'applying', appliedCommit: committed, error: error.slice(0, 500) })
      for (const backup of backups.reverse()) {
        if (backup.content) await writeFile(backup.path, backup.content)
        else await rm(backup.path, { force: true })
      }
      await this.git.restoreManagedChanges(projectRoot).catch(() => undefined)
      await this.workspaces.restoreCandidateAfterApplyFailure(snapshot.workspaceId, candidateId).catch(() => undefined)
      return this.update(snapshot, { state: 'build_passed', error: error.slice(0, 500) })
    }
  }

  async reject(candidateId: string): Promise<CandidateSnapshot> {
    const snapshot = await this.get(candidateId)
    if (!activeStates.has(snapshot.state) && snapshot.state !== 'failed' && snapshot.state !== 'no_changes') throw new Error('CANDIDATE_NOT_REJECTABLE')
    return this.finish(snapshot, 'rejected', undefined, true)
  }

  async cancel(candidateId: string): Promise<CandidateSnapshot> {
    const snapshot = await this.get(candidateId)
    if (!activeStates.has(snapshot.state)) throw new Error('CANDIDATE_NOT_CANCELLABLE')
    return this.finish(snapshot, 'cancelled', undefined, true)
  }

  async getCandidateRootForMain(candidateId: string): Promise<string> {
    await this.get(candidateId)
    return this.candidateRoot(candidateId)
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
    for (const workspace of workspaces) {
      if (workspace.state !== 'applying' || !workspace.activeCandidateId || !(await exists(this.metadataPath(workspace.activeCandidateId)))) continue
      const snapshot = await this.get(workspace.activeCandidateId)
      const projectRoot = await this.workspaces.getProjectRootForMain(workspace.id)
      const clean = await this.git.isClean(projectRoot)
      const head = await this.git.getHead(projectRoot)
      if (clean && head !== snapshot.baseCommit) {
        await this.workspaces.completeCandidateApply(workspace.id, snapshot.id, head)
        if (await exists(this.candidateRoot(snapshot.id))) await this.git.removeWorktree(projectRoot, this.candidateRoot(snapshot.id)).catch(() => undefined)
        await this.update(snapshot, { state: 'applied', appliedCommit: head, error: undefined })
      } else {
        if (!clean) await this.git.restoreManagedChanges(projectRoot).catch(() => undefined)
        await this.workspaces.restoreCandidateAfterApplyFailure(workspace.id, snapshot.id)
        await this.update(snapshot, { state: snapshot.buildProof ? 'build_passed' : 'review_ready', error: '上次应用被中断，正式项目已恢复，可重新尝试。' })
      }
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

function calculateDiffHash(validation: PatchValidationReport, sourceTreeHash: string): string {
  return createHash('sha256').update(JSON.stringify({ files: validation.files, sourceTreeHash })).digest('hex')
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false)
}
