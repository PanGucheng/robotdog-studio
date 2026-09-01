import { randomBytes } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { CreateLessonAttemptInput, CreateWorkspaceInput, WorkspaceCourseBinding, WorkspaceHistoryEntry, WorkspaceMetadata, WorkspacePurpose, WorkspaceSummary } from '../../shared/types'
import type { AppEditionProfile } from '../../shared/edition'
import { EDITION_PROFILES, isMcuEdition } from '../../shared/edition'
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
const lessonAttemptInputSchema = z.object({
  courseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  lessonId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  studentDisplayName: studentNameSchema
}).strict()
const workspacePurposeSchema = z.enum(['fun-project', 'mcu-sandbox', 'mcu-lesson-attempt'])
const courseBindingSchema = z.object({
  courseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  lessonId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  contentVersion: z.number().int().positive(),
  attemptNumber: z.number().int().positive()
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

const metadataSchemaV2 = z.object({
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

const metadataSchemaV3 = z.object({
  schemaVersion: z.literal(3),
  id: z.string().regex(/^ws_[a-f0-9]{24}$/),
  name: workspaceNameSchema,
  studentDisplayName: studentNameSchema,
  learningPath: z.enum(['fun-line-following', 'mcu-foundations']),
  workspacePurpose: workspacePurposeSchema,
  templateId: z.string(), templateVersion: z.string(), courseBinding: courseBindingSchema.optional(),
  firmwareBaselineId: z.string(), baselineCommit: z.string().regex(/^[a-f0-9]{40}$/), nameCustomized: z.boolean(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), activeBranch: z.literal('main'),
  lastCheckpoint: z.string().regex(/^[a-f0-9]{40}$/), policyProfile: z.enum(['student-v1', 'mcu-foundations-v1']),
  state: z.enum(['ready', 'candidate_active', 'applying', 'error', 'conflict', 'archived']), activeCandidateId: z.string().optional()
}).strict()

const metadataSchema = z.object({
  schemaVersion: z.literal(4),
  id: z.string().regex(/^ws_[a-f0-9]{24}$/),
  name: workspaceNameSchema,
  studentDisplayName: studentNameSchema,
  learningPath: z.enum(['fun-line-following', 'mcu-foundations', 'ti-mspm0-foundations']),
  platform: z.enum(['wch-ch32v203', 'ti-mspm0']),
  target: z.enum(['CH32V203C8T6', 'MSPM0G3507']),
  toolchainProfile: z.enum(['wch-gcc12-openocd', 'ti-mspm0-sdk-2.11-gcc9-openocd']),
  workspacePurpose: workspacePurposeSchema,
  templateId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  templateVersion: z.string().min(1).max(64),
  courseBinding: courseBindingSchema.optional(),
  firmwareBaselineId: z.string().min(1).max(96),
  baselineCommit: z.string().regex(/^[a-f0-9]{40}$/),
  nameCustomized: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeBranch: z.literal('main'),
  lastCheckpoint: z.string().regex(/^[a-f0-9]{40}$/),
  policyProfile: z.enum(['student-v1', 'mcu-foundations-v1', 'ti-mspm0-foundations-v1']),
  state: z.enum(['ready', 'candidate_active', 'applying', 'error', 'conflict', 'archived']),
  activeCandidateId: z.string().regex(/^cand_[a-f0-9]{24}$/).optional()
}).strict().superRefine((value, context) => {
  if (value.workspacePurpose === 'mcu-lesson-attempt' && !value.courseBinding) context.addIssue({ code: 'custom', message: 'course binding required' })
  if (value.workspacePurpose !== 'mcu-lesson-attempt' && value.courseBinding) context.addIssue({ code: 'custom', message: 'course binding not allowed' })
  if (value.learningPath === 'fun-line-following' && value.workspacePurpose !== 'fun-project') context.addIssue({ code: 'custom', message: 'fun workspace purpose mismatch' })
  if (value.learningPath !== 'fun-line-following' && value.workspacePurpose === 'fun-project') context.addIssue({ code: 'custom', message: 'mcu workspace purpose mismatch' })
  if (value.learningPath === 'ti-mspm0-foundations' && (value.platform !== 'ti-mspm0' || value.target !== 'MSPM0G3507')) context.addIssue({ code: 'custom', message: 'TI workspace platform mismatch' })
})

export interface WorkspaceCreationSpec {
  workspacePurpose: Extract<WorkspacePurpose, 'mcu-lesson-attempt'>
  templateId: string
  templateVersion: string
  templateRoot: string
  courseBinding: Omit<WorkspaceCourseBinding, 'attemptNumber'>
  lessonTitle: string
  allowedEditGlobs: string[]
  deniedGlobs: string[]
}

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
    return this.createManagedWorkspace(validated)
  }

  async createLessonAttempt(input: CreateLessonAttemptInput, spec: WorkspaceCreationSpec): Promise<WorkspaceSummary> {
    const validated = lessonAttemptInputSchema.parse(input)
    if (!isMcuEdition(this.edition.id)) throw new Error('COURSE_WORKSPACE_EDITION_MISMATCH')
    if (validated.courseId !== spec.courseBinding.courseId || validated.lessonId !== spec.courseBinding.lessonId) throw new Error('COURSE_WORKSPACE_SPEC_MISMATCH')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(spec.templateId)) throw new Error('COURSE_TEMPLATE_ID_INVALID')
    return this.createManagedWorkspace({ studentDisplayName: validated.studentDisplayName }, spec)
  }

  async listLessonAttempts(courseId: string, lessonId: string): Promise<WorkspaceSummary[]> {
    lessonAttemptInputSchema.pick({ courseId: true, lessonId: true }).parse({ courseId, lessonId })
    return (await this.list()).filter((workspace) => workspace.courseBinding?.courseId === courseId && workspace.courseBinding.lessonId === lessonId)
  }

  private async createManagedWorkspace(input: z.infer<typeof createSchema>, spec?: WorkspaceCreationSpec): Promise<WorkspaceSummary> {
    await this.initialize()
    const attemptNumber = spec ? await this.nextAttemptNumber(spec.courseBinding.courseId, spec.courseBinding.lessonId) : undefined
    const name = input.name ?? (spec ? `${spec.lessonTitle} · 第 ${attemptNumber} 次` : await this.nextDefaultName(new Date()))
    const id = `ws_${randomBytes(12).toString('hex')}`
    const temporaryRoot = this.resolveInside(this.workspacesDir, `.creating-${id}`)
    const finalRoot = this.resolveInside(this.workspacesDir, id)
    const projectRoot = join(temporaryRoot, 'project')
    const now = new Date().toISOString()
    try {
      await this.copyTemplate(projectRoot, spec?.templateRoot ?? this.templateRoot)
      await writeFile(join(projectRoot, '.robotdog-managed'), 'RobotDog Studio workspace v1\n', { encoding: 'utf8', flag: 'wx' })
      await this.writeManagedProjectFiles(projectRoot, spec)
      const lastCheckpoint = await this.git.initialize(projectRoot)
      const metadata: WorkspaceMetadata = {
        schemaVersion: 4,
        id,
        name,
        studentDisplayName: input.studentDisplayName,
        learningPath: this.edition.id,
        platform: this.edition.platform,
        target: this.edition.platform === 'ti-mspm0' ? 'MSPM0G3507' : 'CH32V203C8T6',
        toolchainProfile: this.edition.platform === 'ti-mspm0' ? 'ti-mspm0-sdk-2.11-gcc9-openocd' : 'wch-gcc12-openocd',
        workspacePurpose: spec?.workspacePurpose ?? (isMcuEdition(this.edition.id) ? 'mcu-sandbox' : 'fun-project'),
        templateId: spec?.templateId ?? this.edition.templateId,
        templateVersion: spec?.templateVersion ?? this.templateVersion,
        courseBinding: spec && attemptNumber ? { ...spec.courseBinding, attemptNumber } : undefined,
        firmwareBaselineId: this.firmwareBaselineId,
        baselineCommit: this.baselineCommit,
        nameCustomized: input.name !== undefined,
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

  async completeDirectEdit(workspaceId: string, commit: string): Promise<WorkspaceSummary> {
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('WORKSPACE_COMMIT_INVALID')
    const metadata = await this.readMetadata(workspaceId)
    if (metadata.state !== 'ready' || metadata.activeCandidateId) throw new Error('WORKSPACE_BUSY')
    const updated: WorkspaceMetadata = { ...metadata, lastCheckpoint: commit, updatedAt: new Date().toISOString() }
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

  private async copyTemplate(destination: string, templateRoot: string): Promise<void> {
    const resolvedTemplateRoot = resolve(templateRoot)
    await this.validateTemplateTree(resolvedTemplateRoot)
    await mkdir(dirname(destination), { recursive: true })
    await cp(resolvedTemplateRoot, destination, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true })
  }

  private async nextAttemptNumber(courseId: string, lessonId: string): Promise<number> {
    let highest = 0
    for (const entry of await readdir(this.workspacesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('ws_')) continue
      try {
        const raw = JSON.parse(await readFile(join(this.workspacesDir, entry.name, 'workspace.json'), 'utf8')) as { courseBinding?: Partial<WorkspaceCourseBinding> }
        if (raw.courseBinding?.courseId === courseId && raw.courseBinding.lessonId === lessonId && Number.isInteger(raw.courseBinding.attemptNumber)) {
          highest = Math.max(highest, Number(raw.courseBinding.attemptNumber))
        }
      } catch { /* Damaged workspaces do not reserve attempt numbers. */ }
    }
    return highest + 1
  }

  private async nextDefaultName(now: Date): Promise<string> {
    const pad = (value: number): string => String(value).padStart(2, '0')
    const exerciseName = isMcuEdition(this.edition.id) ? '单片机练习' : '巡线练习'
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

  private async writeManagedProjectFiles(projectRoot: string, spec?: WorkspaceCreationSpec): Promise<void> {
    if (this.edition.platform === 'ti-mspm0') await writeFile(join(projectRoot, '.gitignore'), 'generated/\n', 'utf8')
    const policy = isMcuEdition(this.edition.id) ? {
      schemaVersion: 1,
      policyProfile: this.edition.policyProfile,
      allowedEditGlobs: spec?.allowedEditGlobs ?? (this.edition.platform === 'ti-mspm0' ? ['src/**/*.c', 'src/**/*.h', '*.syscfg'] : ['App/Src/**/*.c', 'App/Inc/**/*.h']),
      deniedGlobs: [...new Set(['.git/**', '.gitattributes', '.gitignore', 'generated/**', '**/startup*', '**/*.ld', 'robotdog.project.json', 'reasonix.toml', 'AGENTS.md', ...(this.edition.platform === 'ti-mspm0' ? [] : ['Core/**', 'student-config/**']), ...(spec?.deniedGlobs ?? [])])],
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
    const audience = spec ? `${spec.lessonTitle}课次练习` : isMcuEdition(this.edition.id) ? '单片机入门实验项目' : '趣味巡线项目'
    await writeFile(join(projectRoot, 'AGENTS.md'), `# RobotDog ${audience}\n\n只修改 robotdog.project.json 允许的教学文件。禁止运行命令、修改构建与启动配置。\n`, 'utf8')
  }

  private async parseOrMigrateMetadata(metadataPath: string, raw: unknown): Promise<WorkspaceMetadata> {
    const current = metadataSchema.safeParse(raw)
    if (current.success) return current.data
    const versionThree = metadataSchemaV3.safeParse(raw)
    if (versionThree.success) {
      const migrated: WorkspaceMetadata = {
        ...versionThree.data,
        schemaVersion: 4,
        platform: 'wch-ch32v203',
        target: 'CH32V203C8T6',
        toolchainProfile: 'wch-gcc12-openocd'
      }
      return this.persistMigration(metadataPath, migrated, '.v3.bak')
    }
    const versionTwo = metadataSchemaV2.safeParse(raw)
    if (versionTwo.success) {
      const migrated: WorkspaceMetadata = {
        ...versionTwo.data,
        schemaVersion: 4,
        platform: 'wch-ch32v203',
        target: 'CH32V203C8T6',
        toolchainProfile: 'wch-gcc12-openocd',
        workspacePurpose: versionTwo.data.learningPath === 'mcu-foundations' ? 'mcu-sandbox' : 'fun-project'
      }
      return this.persistMigration(metadataPath, migrated, '.v2.bak')
    }
    const legacy = legacyMetadataSchema.parse(raw)
    if (this.edition.id !== 'fun-line-following') throw new Error('WORKSPACE_EDITION_MISMATCH')
    const migrated: WorkspaceMetadata = {
      ...legacy,
      schemaVersion: 4,
      learningPath: 'fun-line-following',
      platform: 'wch-ch32v203',
      target: 'CH32V203C8T6',
      toolchainProfile: 'wch-gcc12-openocd',
      workspacePurpose: 'fun-project'
    }
    return this.persistMigration(metadataPath, migrated, '.v1.bak')
  }

  private async persistMigration(metadataPath: string, migrated: WorkspaceMetadata, backupSuffix: string): Promise<WorkspaceMetadata> {
    const backupPath = `${metadataPath}${backupSuffix}`
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
    const { id, name, studentDisplayName, learningPath, platform, target, toolchainProfile, workspacePurpose, templateId, templateVersion, courseBinding, firmwareBaselineId, baselineCommit, createdAt, lastCheckpoint: headCommit, state, updatedAt, activeCandidateId } = metadata
    return { id, name, studentDisplayName, learningPath, platform, target, toolchainProfile, workspacePurpose, templateId, templateVersion, courseBinding, firmwareBaselineId, baselineCommit, createdAt, headCommit, state, updatedAt, activeCandidateId }
  }
}
