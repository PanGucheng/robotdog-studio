import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CandidateService } from './candidate-service'
import { SourceFingerprintService } from './source-fingerprint-service'
import { WorkspaceService } from './workspace-service'
import { GitWorkspaceService } from './git-workspace-service'
import { PatchPolicyService } from './patch-policy-service'
import type { CandidateBuilder, CandidateBuildInput } from './candidate-build-service'

const passingBuilder: CandidateBuilder = {
  async build(input: CandidateBuildInput) {
    return {
      candidateId: input.candidateId, sourceTreeHash: input.sourceTreeHash, diffHash: input.diffHash,
      compiler: 'test WCH GCC', objectSha256: 'a'.repeat(64), completedAt: new Date().toISOString(),
      checks: [{ id: 'c-source', label: '学生控制代码', detail: '测试编译通过' }, { id: 'line-config', label: '巡线参数', detail: '范围正确' }]
    }
  }
}

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
    candidates = new CandidateService({ rootDir: dataRoot, workspaces, builder: passingBuilder })
    await candidates.initialize()
  })

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
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

  it('builds, applies, checkpoints, and reverts an approved candidate', async () => {
    const candidate = await candidates.create(workspaceId)
    const candidateFile = join(dataRoot, 'candidates', candidate.id, 'student-config', 'line-following.yaml')
    await writeFile(candidateFile, 'turn_strength: 16\n')
    await candidates.validate(candidate.id)

    const built = await candidates.build(candidate.id)
    expect(built.state).toBe('build_passed')
    expect(built.buildProof).toMatchObject({ sourceTreeHash: built.sourceTreeHash, diffHash: built.diffHash })

    const applied = await candidates.apply(candidate.id)
    expect(applied.state).toBe('applied')
    expect(applied.appliedCommit).toMatch(/^[a-f0-9]{40}$/)
    const formalFile = join(dataRoot, 'workspaces', workspaceId, 'project', 'student-config', 'line-following.yaml')
    expect(await readFile(formalFile, 'utf8')).toContain('16')
    expect((await workspaces.history(workspaceId, 2))[0].message).toContain('apply AI candidate')

    const undone = await workspaces.undoLast(workspaceId)
    expect(undone.state).toBe('ready')
    expect(await readFile(formalFile, 'utf8')).toContain('18')
    expect((await workspaces.history(workspaceId, 2))[0].message).toMatch(/^Revert/)
    await expect(workspaces.undoLast(workspaceId)).rejects.toThrow('WORKSPACE_NOTHING_TO_UNDO')
  }, 15_000)

  it('invalidates the build proof when candidate files change after compilation', async () => {
    const candidate = await candidates.create(workspaceId)
    const candidateFile = join(dataRoot, 'candidates', candidate.id, 'student-config', 'line-following.yaml')
    await writeFile(candidateFile, 'turn_strength: 16\n')
    await candidates.validate(candidate.id)
    await candidates.build(candidate.id)
    await writeFile(candidateFile, 'turn_strength: 15\n')

    const refused = await candidates.apply(candidate.id)
    expect(refused.state).toBe('review_ready')
    expect(refused.buildProof).toBeUndefined()
    expect(refused.error).toContain('发生变化')
    expect(await readFile(join(dataRoot, 'workspaces', workspaceId, 'project', 'student-config', 'line-following.yaml'), 'utf8')).toContain('18')
  })

  it('rolls back formal files when the Git checkpoint cannot be created', async () => {
    class FailingCommitGit extends GitWorkspaceService {
      override async commitAll(): Promise<string> { throw new Error('TEST_COMMIT_FAILED') }
    }
    const service = new CandidateService({ rootDir: dataRoot, workspaces, git: new FailingCommitGit(), builder: passingBuilder })
    const candidate = await service.create(workspaceId)
    const candidateFile = join(dataRoot, 'candidates', candidate.id, 'student-config', 'line-following.yaml')
    await writeFile(candidateFile, 'turn_strength: 16\n')
    await service.validate(candidate.id)
    await service.build(candidate.id)

    const result = await service.apply(candidate.id)
    expect(result.state).toBe('build_passed')
    expect(result.error).toContain('TEST_COMMIT_FAILED')
    expect((await workspaces.get(workspaceId)).state).toBe('candidate_active')
    expect(await readFile(join(dataRoot, 'workspaces', workspaceId, 'project', 'student-config', 'line-following.yaml'), 'utf8')).toContain('18')
    await service.reject(candidate.id)
  })

  it('finishes a committed application after an interrupted metadata update', async () => {
    class InterruptedWorkspaceService extends WorkspaceService {
      failOnce = true
      override async completeCandidateApply(workspace: string, candidate: string, commit: string) {
        if (this.failOnce) { this.failOnce = false; throw new Error('TEST_APP_INTERRUPTED') }
        return super.completeCandidateApply(workspace, candidate, commit)
      }
    }
    const interruptedWorkspaces = new InterruptedWorkspaceService({ rootDir: dataRoot, templateRoot })
    const service = new CandidateService({ rootDir: dataRoot, workspaces: interruptedWorkspaces, builder: passingBuilder })
    const candidate = await service.create(workspaceId)
    await writeFile(join(dataRoot, 'candidates', candidate.id, 'student-config', 'line-following.yaml'), 'turn_strength: 16\n')
    await service.validate(candidate.id)
    await service.build(candidate.id)
    const interrupted = await service.apply(candidate.id)
    expect(interrupted.state).toBe('applying')
    expect(interrupted.appliedCommit).toMatch(/^[a-f0-9]{40}$/)

    const recovered = new CandidateService({ rootDir: dataRoot, workspaces, builder: passingBuilder })
    await recovered.initialize()
    expect((await recovered.get(candidate.id)).state).toBe('applied')
    expect((await workspaces.get(workspaceId)).state).toBe('ready')
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
