import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CandidateService } from './candidate-service'
import { SourceFingerprintService } from './source-fingerprint-service'
import { WorkspaceService } from './workspace-service'
import { GitWorkspaceService } from './git-workspace-service'
import { PatchPolicyService } from './patch-policy-service'

describe('CandidateService', () => {
  let sandbox: string
  let dataRoot: string
  let templateRoot: string
  let workspaces: WorkspaceService
  let candidates: CandidateService
  let workspaceId: string

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'robotdog-candidate-'))
    dataRoot = join(sandbox, 'data root')
    templateRoot = join(sandbox, 'template')
    await mkdir(join(templateRoot, 'Core', 'Src'), { recursive: true })
    await mkdir(join(templateRoot, 'Core', 'Inc'), { recursive: true })
    await mkdir(join(templateRoot, 'student-config'), { recursive: true })
    await writeFile(join(templateRoot, 'Core', 'Src', 'student_control.c'), '#include "student_control.h"\nvoid StudentControl_Update(void) {}\n')
    await writeFile(join(templateRoot, 'Core', 'Inc', 'student_control.h'), 'void StudentControl_Update(void);\n')
    await writeFile(join(templateRoot, 'student-config', 'line-following.yaml'), 'turn_strength: 18\n')
    workspaces = new WorkspaceService({ rootDir: dataRoot, templateRoot })
    workspaceId = (await workspaces.create({ name: '候选训练', studentDisplayName: '陈同学' })).id
    candidates = new CandidateService({ rootDir: dataRoot, workspaces })
    await candidates.initialize()
  })

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  it('isolates an allowed modification, validates it, and rejects it cleanly', async () => {
    const candidate = await candidates.create(workspaceId)
    const candidateFile = join(dataRoot, 'candidates', candidate.id, 'student-config', 'line-following.yaml')
    await writeFile(candidateFile, 'turn_strength: 16\n')

    const validated = await candidates.validate(candidate.id)
    expect(validated.state).toBe('review_ready')
    expect(validated.validation).toMatchObject({ valid: true, changedFiles: 1 })
    expect(validated.validation?.files[0]).toMatchObject({ path: 'student-config/line-following.yaml', status: 'modified' })
    expect(validated.sourceTreeHash).not.toBe(candidate.baseTreeHash)
    const diff = await candidates.getDiff(candidate.id)
    expect(diff.files[0]).toMatchObject({ path: 'student-config/line-following.yaml', before: 'turn_strength: 18\n', after: 'turn_strength: 16\n' })
    expect(await readFile(join(dataRoot, 'workspaces', workspaceId, 'project', 'student-config', 'line-following.yaml'), 'utf8')).toContain('18')

    const rejected = await candidates.reject(candidate.id)
    expect(rejected.state).toBe('rejected')
    expect((await workspaces.get(workspaceId)).state).toBe('ready')
    await expect(readFile(candidateFile, 'utf8')).rejects.toThrow()
  })

  it('blocks policy files, binary content, deletion, and rename', async () => {
    const candidate = await candidates.create(workspaceId)
    const root = join(dataRoot, 'candidates', candidate.id)
    await writeFile(join(root, 'AGENTS.md'), 'modified\n')
    await writeFile(join(root, 'student-config', 'binary.yaml'), Buffer.from([0, 1, 2, 3]))
    await rm(join(root, 'Core', 'Inc', 'student_control.h'))
    await writeFile(join(root, 'Core', 'Src', 'renamed.c'), await readFile(join(root, 'Core', 'Src', 'student_control.c')))
    await rm(join(root, 'Core', 'Src', 'student_control.c'))

    const validated = await candidates.validate(candidate.id)
    const codes = validated.validation?.violations.map((item) => item.code) ?? []
    expect(validated.state).toBe('failed')
    expect(codes).toContain('PATCH_PATH_DENIED')
    expect(codes).toContain('PATCH_BINARY_DENIED')
    expect(codes).toContain('PATCH_DELETE_DENIED')
    expect(codes).toContain('PATCH_RENAME_DENIED')
  })

  it('allows only one active candidate and refuses dirty formal workspaces', async () => {
    const first = await candidates.create(workspaceId)
    await expect(candidates.create(workspaceId)).rejects.toThrow('WORKSPACE_CANDIDATE_ACTIVE')
    await candidates.reject(first.id)

    await writeFile(join(dataRoot, 'workspaces', workspaceId, 'project', 'student-config', 'line-following.yaml'), 'turn_strength: 99\n')
    await expect(candidates.create(workspaceId)).rejects.toThrow('WORKSPACE_DIRTY')
  })

  it('rejects oversized files, secrets, and junction escapes', async () => {
    const first = await candidates.create(workspaceId)
    const firstRoot = join(dataRoot, 'candidates', first.id)
    await writeFile(join(firstRoot, 'student-config', 'line-following.yaml'), `api_key = '${'a'.repeat(80)}'\n${'x'.repeat(70_000)}`)
    const unsafe = await candidates.validate(first.id)
    const codes = unsafe.validation?.violations.map((item) => item.code) ?? []
    expect(codes).toContain('PATCH_FILE_TOO_LARGE')
    expect(codes).toContain('PATCH_SECRET_DENIED')
    await candidates.reject(first.id)

    const second = await candidates.create(workspaceId)
    const secondRoot = join(dataRoot, 'candidates', second.id)
    const outside = join(sandbox, 'outside-config')
    await mkdir(outside)
    await writeFile(join(outside, 'line-following.yaml'), 'turn_strength: 99\n')
    await rm(join(secondRoot, 'student-config'), { recursive: true })
    await symlink(outside, join(secondRoot, 'student-config'), 'junction')
    const escaped = await candidates.validate(second.id)
    expect(escaped.state).toBe('failed')
    expect(escaped.error).toMatch(/PATCH_LINK_DENIED|SOURCE_LINK_DENIED/)
  }, 20_000)

  it('marks expired candidates stale during startup recovery and removes the worktree', async () => {
    const expiring = new CandidateService({ rootDir: dataRoot, workspaces, lifetimeMs: -1 })
    const candidate = await expiring.create(workspaceId)
    await expiring.initialize()

    expect((await expiring.get(candidate.id)).state).toBe('stale')
    expect((await workspaces.get(workspaceId)).state).toBe('ready')
    await expect(readFile(join(dataRoot, 'candidates', candidate.id, '.robotdog-managed'), 'utf8')).rejects.toThrow()
  })

  it('recovers an orphan worktree when candidate metadata is missing', async () => {
    const candidate = await candidates.create(workspaceId)
    await rm(join(dataRoot, 'candidates', `${candidate.id}.json`))
    await new CandidateService({ rootDir: dataRoot, workspaces }).initialize()

    expect((await workspaces.get(workspaceId)).state).toBe('ready')
    await expect(readFile(join(dataRoot, 'candidates', candidate.id, '.robotdog-managed'), 'utf8')).rejects.toThrow()
  })
})

describe('SourceFingerprintService', () => {
  it('is deterministic and ignores Git metadata while tracking source changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-fingerprint-'))
    try {
      await mkdir(join(root, '.git'))
      await writeFile(join(root, 'student.c'), 'void run(void) {}\n')
      await writeFile(join(root, '.git', 'index'), 'one')
      const service = new SourceFingerprintService()
      const first = await service.calculate(root)
      await writeFile(join(root, '.git', 'index'), 'two')
      expect(await service.calculate(root)).toBe(first)
      await writeFile(join(root, 'student.c'), 'void run(void) { int speed = 1; }\n')
      expect(await service.calculate(root)).not.toBe(first)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('PatchPolicyService path boundary', () => {
  it('rejects traversal paths even when reported by Git metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'robotdog-policy-'))
    class TraversalGitService extends GitWorkspaceService {
      override async changedFiles(): Promise<Array<{ code: string; path: string }>> { return [{ code: '??', path: '../outside.c' }] }
      override async workingFileHash(): Promise<undefined> { return undefined }
    }
    try {
      await writeFile(join(root, 'robotdog.project.json'), JSON.stringify({
        schemaVersion: 1, policyProfile: 'student-v1', allowedEditGlobs: ['**/*.c'], deniedGlobs: [],
        maxChangedFiles: 12, maxPatchBytes: 96_000, maxSingleFileBytes: 64_000, maxAddedLines: 1_000
      }))
      await expect(new PatchPolicyService(new TraversalGitService()).validate(root)).rejects.toThrow('PATCH_PATH_OUTSIDE_ROOT')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
