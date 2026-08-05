import { randomBytes } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { CreateWorkspaceInput, WorkspaceHistoryEntry, WorkspaceMetadata, WorkspaceSummary } from '../../shared/types'
import type { AppEditionProfile } from '../../shared/edition'
import { EDITION_PROFILES } from '../../shared/edition'
import { GitWorkspaceService } from './git-workspace-service'

const MAX_TEMPLATE_FILE_BYTES = 4 * 1024 * 1024
const PROVISIONAL_BASELINE_ID = 'ch32v203-robotdog-provisional-0858d82'
const PROVISIONAL_BASELINE_COMMIT = '0858d821d56daaea6e45740f5b496714fea20aca'
const workspaceNameSchema = z.string().trim().min(1).max(48).refine((value) => !/[<>"/\\|?*\u0000-\u001f]/.test(value), '对话名称包含不支持的字符')
const studentNameSchema = z.string().trim().min(1).max(24).refine((value) => !/[<>:"/\\|?*\u0000-\u001f]/.test(value), '学生名称包含 Windows 不支持的字符')
const createSchema = z.object({
  name: workspaceNameSchema.optional(),
  studentDisplayName: studentNameSchema
}).strict()

const legacyMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^ws_[a-f0-9]{24}$/),
  name: workspaceNameSchema,
  studentDisplayName: studentNameSchema,
  templateId: z.literal('ch32v203-robotdog'),
  templateVersion: z.string().min(1).max(32),
  firmwareBaselineId: z.string().min(1).max(96).default(PROVISIONAL_BASELINE_ID),
  baselineCommit: z.string().regex(/^[a-f0-9]{40}$/).default(PROVISIONAL_BASELINE_COMMIT),
  nameCustomized: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeBranch: z.literal('main'),
  lastCheckpoint: z.string().regex(/^[a-f0-9]{40}$/),
  policyProfile: z.literal('student-v1'),
  state: z.enum(['ready', 'candidate_active', 'applying', 'error', 'conflict', 'archived']),
  activeCandidateId: z.string().regex(/^cand_[a-f0-9]{24}$/).optional()
}).strict()

const metadataSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().regex(/^ws_[a-f0-9]{24}$/),
  name: workspaceNameSchema,
  studentDisplayName: studentNameSchema,
  learningPath: z.enum(['fun-line-following', 'mcu-foundations']),
  templateId: z.enum(['ch32v203-robotdog', 'ch32v203-mcu-foundations']),
  templateVersion: z.string().min(1).max(64),
  firmwareBaselineId: z.string().min(1).max(96),
  baselineCommit: z.string().regex(/^[a-f0-9]{40}$/),
  nameCustomized: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeBranch: z.literal('main'),
  lastCheckpoint: z.string().regex(/^[a-f0-9]{40}$/),
  policyProfile: z.enum(['student-v1', 'mcu-foundations-v1']),
  state: z.enum(['ready', 'candidate_active', 'applying', 'error', 'conflict', 'archived']),
  activeCandidateId: z.string().regex(/^cand_[a-f0-9]{24}$/).optional()
}).strict()

export interface WorkspaceServiceOptions {
  rootDir: string
  templateRoot: string
  templateVersion?: string
  firmwareBaselineId?: string
  baselineCommit?: string
  git?: GitWorkspaceService
  edition?: AppEditionProfile
}

export class WorkspaceService {
  private readonly rootDir: string
  private readonly workspacesDir: string
  private readonly templateRoot: string
  private readonly templateVersion: string
  private readonly firmwareBaselineId: string
  private readonly baselineCommit: string
  private readonly git: GitWorkspaceService
  private readonly edition: AppEditionProfile

  constructor(options: WorkspaceServiceOptions) {
    this.rootDir = resolve(options.rootDir)
    this.workspacesDir = join(this.rootDir, 'workspaces')
    this.templateRoot = resolve(options.templateRoot)
    this.templateVersion = options.templateVersion ?? '2026.06'
    this.firmwareBaselineId = options.firmwareBaselineId ?? PROVISIONAL_BASELINE_ID
    this.baselineCommit = options.baselineCommit ?? PROVISIONAL_BASELINE_COMMIT
    this.git = options.git ?? new GitWorkspaceService()
    this.edition = options.edition ?? EDITION_PROFILES['fun-line-following']
  }

  async initialize(): Promise<void> {
    await mkdir(this.workspacesDir, { recursive: true })
    await Promise.all(['candidates', 'build-cache', 'templates', 'secure'].map((name) => mkdir(join(this.rootDir, name), { recursive: true })))
    const entries = await readdir(this.workspacesDir, { withFileTypes: true })
    await Promise.all(entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('.creating-')).map((entry) => rm(join(this.workspacesDir, entry.name), { recursive: true, force: true })))
  }

  async create(input: CreateWorkspaceInput): Promise<WorkspaceSummary> {
    const validated = createSchema.parse(input)
    await this.initialize()
    const name = validated.name ?? await this.nextDefaultName(new Date())
    const id = `ws_${randomBytes(12).toString('hex')}`
    const temporaryRoot = this.resolveInside(this.workspacesDir, `.creating-${id}`)
    const finalRoot = this.resolveInside(this.workspacesDir, id)
    const projectRoot = join(temporaryRoot, 'project')
    const now = new Date().toISOString()
    try {
      await this.copyTemplate(projectRoot)
      await writeFile(join(projectRoot, '.robotdog-managed'), 'RobotDog Studio workspace v1\n', { encoding: 'utf8', flag: 'wx' })
      await this.writeManagedProjectFiles(projectRoot)
      const lastCheckpoint = await this.git.initialize(projectRoot)
      const metadata: WorkspaceMetadata = {
        schemaVersion: 2,
        id,
        name,
        studentDisplayName: validated.studentDisplayName,
        learningPath: this.edition.id,
        templateId: this.edition.templateId,
        templateVersion: this.templateVersion,
        firmwareBaselineId: this.firmwareBaselineId,
        baselineCommit: this.baselineCommit,
        nameCustomized: validated.name !== undefined,
        createdAt: now,
        updatedAt: now,
        activeBranch: 'main',
        lastCheckpoint,
        policyProfile: this.edition.policyProfile,
        state: 'ready'
      }
      await writeFile(join(temporaryRoot, 'workspace.json'), `${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      await mkdir(join(temporaryRoot, 'conversations'))
      await mkdir(join(temporaryRoot, 'diagnostics'))
      await rename(temporaryRoot, finalRoot)
      return this.toSummary(metadata)
    } catch (caught) {
      await rm(temporaryRoot, { recursive: true, force: true })
      throw caught
    }
  }

  async list(): Promise<WorkspaceSummary[]> {
    await this.initialize()
    const entries = await readdir(this.workspacesDir, { withFileTypes: true })
    const results: WorkspaceSummary[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('ws_')) continue
      try {
        results.push(this.toSummary(await this.readMetadata(entry.name)))
      } catch (caught) {
        if ((caught as NodeJS.ErrnoException).code === 'ENOENT') continue
        const detail = caught instanceof Error ? caught.message : 'UNKNOWN'
        throw new Error(`WORKSPACE_LIST_FAILED:${entry.name}:${detail}`)
      }
    }
    return results.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async get(workspaceId: string): Promise<WorkspaceSummary> {
    return this.toSummary(await this.readMetadata(workspaceId))
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceSummary> {
    const validatedName = workspaceNameSchema.parse(name)
    const metadata = await this.readMetadata(workspaceId)
    const updated: WorkspaceMetadata = { ...metadata, name: validatedName, nameCustomized: true, updatedAt: new Date().toISOString() }
    await this.writeMetadata(updated)
    return this.toSummary(updated)
  }

  async history(workspaceId: string, limit?: number): Promise<WorkspaceHistoryEntry[]> {
    const metadata = await this.readMetadata(workspaceId)
    return this.git.history(this.projectPath(metadata.id), limit)
  }

  async getProjectRootForMain(workspaceId: string): Promise<string> {
    const metadata = await this.readMetadata(workspaceId)
    return this.projectPath(metadata.id)
  }

  async setCandidateState(workspaceId: string, state: 'ready' | 'candidate_active', activeCandidateId?: string): Promise<WorkspaceSummary> {
    const metadata = await this.readMetadata(workspaceId)
    if (state === 'candidate_active' && !activeCandidateId) throw new Error('CANDIDATE_ID_REQUIRED')
    const updated: WorkspaceMetadata = { ...metadata, state, activeCandidateId: state === 'candidate_active' ? activeCandidateId : undefined, updatedAt: new Date().toISOString() }
    await this.writeMetadata(updated)
    return this.toSummary(updated)
  }

  async beginCandidateApply(workspaceId: string, candidateId: string): Promise<WorkspaceSummary> {
    const metadata = await this.readMetadata(workspaceId)
    if (metadata.state !== 'candidate_active' || metadata.activeCandidateId !== candidateId) throw new Error('WORKSPACE_CANDIDATE_MISMATCH')
    const updated: WorkspaceMetadata = { ...metadata, state: 'applying', updatedAt: new Date().toISOString() }
    await this.writeMetadata(updated)
    return this.toSummary(updated)
  }

  async completeCandidateApply(workspaceId: string, candidateId: string, commit: string): Promise<WorkspaceSummary> {
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('WORKSPACE_COMMIT_INVALID')
    const metadata = await this.readMetadata(workspaceId)
    if (metadata.activeCandidateId !== candidateId || !['applying', 'candidate_active'].includes(metadata.state)) throw new Error('WORKSPACE_CANDIDATE_MISMATCH')
    const updated: WorkspaceMetadata = { ...metadata, state: 'ready', activeCandidateId: undefined, lastCheckpoint: commit, updatedAt: new Date().toISOString() }
    await this.writeMetadata(updated)
    return this.toSummary(updated)
  }

  async restoreCandidateAfterApplyFailure(workspaceId: string, candidateId: string): Promise<WorkspaceSummary> {
    const metadata = await this.readMetadata(workspaceId)
    if (metadata.activeCandidateId !== candidateId) throw new Error('WORKSPACE_CANDIDATE_MISMATCH')
    const updated: WorkspaceMetadata = { ...metadata, state: 'candidate_active', updatedAt: new Date().toISOString() }
    await this.writeMetadata(updated)
    return this.toSummary(updated)
  }

  async undoLast(workspaceId: string): Promise<WorkspaceSummary> {
    const metadata = await this.readMetadata(workspaceId)
    if (metadata.state !== 'ready' || metadata.activeCandidateId) throw new Error('WORKSPACE_BUSY')
    const projectRoot = this.projectPath(workspaceId)
    if (!(await this.git.isClean(projectRoot))) throw new Error('WORKSPACE_DIRTY')
    const commit = await this.git.revertHead(projectRoot)
    const updated: WorkspaceMetadata = { ...metadata, lastCheckpoint: commit, updatedAt: new Date().toISOString() }
    await this.writeMetadata(updated)
    return this.toSummary(updated)
  }

  private async readMetadata(workspaceId: string): Promise<WorkspaceMetadata> {
    if (!/^ws_[a-f0-9]{24}$/.test(workspaceId)) throw new Error('WORKSPACE_ID_INVALID')
    const metadataPath = this.resolveInside(this.workspacesDir, workspaceId, 'workspace.json')
    const raw = JSON.parse(await readFile(metadataPath, 'utf8')) as unknown
    const parsed = await this.parseOrMigrateMetadata(metadataPath, raw)
    if (parsed.id !== workspaceId) throw new Error('WORKSPACE_ID_MISMATCH')
    if (parsed.learningPath !== this.edition.id) throw new Error('WORKSPACE_EDITION_MISMATCH')
    await this.git.assertManagedRepository(this.projectPath(workspaceId))
    return parsed
  }

  private projectPath(workspaceId: string): string {
    return this.resolveInside(this.workspacesDir, workspaceId, 'project')
  }

  private async writeMetadata(metadata: WorkspaceMetadata): Promise<void> {
    const workspaceRoot = this.resolveInside(this.workspacesDir, metadata.id)
    const temporaryPath = join(workspaceRoot, 'workspace.json.tmp')
    await writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, join(workspaceRoot, 'workspace.json'))
  }

  private async copyTemplate(destination: string): Promise<void> {
    await this.validateTemplateTree(this.templateRoot)
    await mkdir(dirname(destination), { recursive: true })
    await cp(this.templateRoot, destination, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true })
  }

  private async nextDefaultName(now: Date): Promise<string> {
    const pad = (value: number): string => String(value).padStart(2, '0')
    const exerciseName = this.edition.id === 'mcu-foundations' ? '单片机练习' : '巡线练习'
    const base = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} ${exerciseName}`
    const names = new Set<string>()
    for (const entry of await readdir(this.workspacesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('ws_')) continue
      try {
        const raw = JSON.parse(await readFile(join(this.workspacesDir, entry.name, 'workspace.json'), 'utf8')) as { name?: unknown }
        if (typeof raw.name === 'string') names.add(raw.name)
      } catch { /* Damaged workspaces do not reserve display names. */ }
    }
    if (!names.has(base)) return base
    for (let index = 2; index < 10_000; index += 1) {
      const candidate = `${base}（${index}）`
      if (!names.has(candidate)) return candidate
    }
    throw new Error('WORKSPACE_NAME_EXHAUSTED')
  }

  private async validateTemplateTree(directory: string): Promise<void> {
    const info = await stat(directory)
    if (!info.isDirectory()) throw new Error('WORKSPACE_TEMPLATE_INVALID')
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error('WORKSPACE_TEMPLATE_LINK_DENIED')
      if (entry.isDirectory()) await this.validateTemplateTree(path)
      else if (!entry.isFile() || (await stat(path)).size > MAX_TEMPLATE_FILE_BYTES) throw new Error('WORKSPACE_TEMPLATE_FILE_DENIED')
    }
  }

  private async writeManagedProjectFiles(projectRoot: string): Promise<void> {
    const policy = this.edition.id === 'mcu-foundations' ? {
      schemaVersion: 1,
      policyProfile: 'mcu-foundations-v1',
      allowedEditGlobs: ['App/Src/**/*.c', 'App/Inc/**/*.h'],
      deniedGlobs: ['.git/**', '.gitattributes', '.gitignore', 'Core/**', 'student-config/**', '**/startup*', '**/*.ld', 'robotdog.project.json', 'reasonix.toml', 'AGENTS.md'],
      maxChangedFiles: 20,
      maxPatchBytes: 160_000,
      maxSingleFileBytes: 96_000,
      maxAddedLines: 1_500
    } : {
      schemaVersion: 1,
      policyProfile: 'student-v1',
      allowedEditGlobs: ['Core/Src/student_control.c', 'Core/Inc/student_control.h', 'student-config/*.yaml'],
      deniedGlobs: ['.git/**', '.gitattributes', '.gitignore', '**/startup*', '**/*.ld', 'robotdog.project.json', 'reasonix.toml', 'AGENTS.md'],
      maxChangedFiles: 12,
      maxPatchBytes: 96_000,
      maxSingleFileBytes: 64_000,
      maxAddedLines: 1_000
    }
    await writeFile(join(projectRoot, 'robotdog.project.json'), `${JSON.stringify(policy, null, 2)}\n`, 'utf8')
    await writeFile(join(projectRoot, 'reasonix.toml'), '# Generated by RobotDog Studio. AI tools are enabled in a later phase.\n', 'utf8')
    const audience = this.edition.id === 'mcu-foundations' ? '单片机入门实验项目' : '趣味巡线项目'
    await writeFile(join(projectRoot, 'AGENTS.md'), `# RobotDog ${audience}\n\n只修改 robotdog.project.json 允许的教学文件。禁止运行命令、修改构建与启动配置。\n`, 'utf8')
  }

  private async parseOrMigrateMetadata(metadataPath: string, raw: unknown): Promise<WorkspaceMetadata> {
    const current = metadataSchema.safeParse(raw)
    if (current.success) return current.data
    const legacy = legacyMetadataSchema.parse(raw)
    if (this.edition.id !== 'fun-line-following') throw new Error('WORKSPACE_EDITION_MISMATCH')
    const migrated: WorkspaceMetadata = {
      ...legacy,
      schemaVersion: 2,
      learningPath: 'fun-line-following'
    }
    const backupPath = `${metadataPath}.v1.bak`
    await copyFile(metadataPath, backupPath, fsConstants.COPYFILE_EXCL).catch(async (caught: NodeJS.ErrnoException) => {
      if (caught.code !== 'EEXIST') throw caught
    })
    const temporaryPath = `${metadataPath}.migrating-${randomBytes(6).toString('hex')}`
    try {
      await writeFile(temporaryPath, `${JSON.stringify(migrated, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
      await rename(temporaryPath, metadataPath)
    } finally {
      await rm(temporaryPath, { force: true })
    }
    return metadataSchema.parse(migrated)
  }

  private resolveInside(root: string, ...parts: string[]): string {
    const candidate = resolve(root, ...parts)
    const rel = relative(resolve(root), candidate)
    if (rel === '..' || rel.startsWith(`..${sep}`) || rel.includes(`:${sep}`)) throw new Error('WORKSPACE_PATH_OUTSIDE_ROOT')
    return candidate
  }

  private toSummary(metadata: WorkspaceMetadata): WorkspaceSummary {
    const { id, name, studentDisplayName, learningPath, templateId, templateVersion, firmwareBaselineId, baselineCommit, createdAt, lastCheckpoint: headCommit, state, updatedAt, activeCandidateId } = metadata
    return { id, name, studentDisplayName, learningPath, templateId, templateVersion, firmwareBaselineId, baselineCommit, createdAt, headCommit, state, updatedAt, activeCandidateId }
  }
}
