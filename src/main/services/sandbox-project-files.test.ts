import { mkdtemp, mkdir, readFile, rm, writeFile, stat, symlink, unlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EDITION_PROFILES } from '../../shared/edition'
import { WorkspaceService } from './workspace-service'
import { GitWorkspaceService } from './git-workspace-service'
import { ProjectExplorerService } from './project-explorer-service'
import { FirmwareBaselineService } from './firmware-baseline-service'
import { CandidateService } from './candidate-service'
import { assertSandboxParent, isSandboxProjectPath, listSandboxDirectories, listSandboxProjectFiles } from './sandbox-project-files'

describe('complete sandbox projects', () => {
  let temporary: string | undefined
  afterEach(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }) })
  it.each(['mcu-foundations', 'ti-mspm0-foundations'] as const)('edits source, startup, linker and configuration independently in %s', async editionId => {
    temporary = await mkdtemp(join(tmpdir(), 'robohorse-sandbox-'))
    const template = join(temporary, 'template')
    const baseline = join(temporary, 'baseline')
    await mkdir(join(template, 'src'), { recursive: true })
    await writeFile(join(template, 'src', 'main.c'), '/* student template */\n')
    await mkdir(join(baseline, 'src'), { recursive: true })
    await mkdir(join(baseline, 'Startup'), { recursive: true })
    await mkdir(join(baseline, 'Ld'), { recursive: true })
    await writeFile(join(baseline, 'src', 'main.c'), '/* baseline */\n')
    await writeFile(join(baseline, 'Startup', 'startup.S'), '/* startup */\n')
    await writeFile(join(baseline, 'Ld', 'Link.ld'), 'MEMORY {}\n')
    await writeFile(join(baseline, 'CMakeLists.txt'), 'project(test)\n')
    const options = { rootDir: join(temporary, 'data'), templateRoot: template, edition: EDITION_PROFILES[editionId] }
    // Upgrade an older overlay workspace without replacing student modifications.
    const oldService = new WorkspaceService(options)
    const old = await oldService.create({ studentDisplayName: '测试同学' })
    const workspaces = new WorkspaceService({ ...options, sandboxSourceResolver: async () => baseline })
    const oldRoot = await oldService.getProjectRootForMain(old.id)
    await writeFile(join(oldRoot, 'src', 'main.c'), '/* pending student edit */\n')
    expect((await workspaces.get(old.id)).headCommit).toBe(old.headCommit)
    expect(await readFile(join(oldRoot, 'src', 'main.c'), 'utf8')).toContain('pending student edit')
    await writeFile(join(oldRoot, 'src', 'main.c'), '/* student template */\n')
    const migrated = await workspaces.get(old.id)
    expect(migrated.headCommit).not.toBe(old.headCommit)
    const root = await workspaces.getProjectRootForMain(old.id)
    expect(await readFile(join(root, 'src', 'main.c'), 'utf8')).toContain('student template')
    const files = await listSandboxProjectFiles(root)
    expect(files.map(file => file.path)).toEqual(expect.arrayContaining(['Startup/startup.S', 'Ld/Link.ld', 'CMakeLists.txt']))
    expect(files.every(file => file.editable)).toBe(true)
    const candidates = new CandidateService({ rootDir: options.rootDir, workspaces })
    for (const path of ['Startup/startup.S', 'Ld/Link.ld', 'CMakeLists.txt']) {
      await candidates.writeWorkspaceFile(old.id, path, `${(await readFile(join(root, ...path.split('/')), 'utf8'))}\n/* student edit */\n`)
      expect(await readFile(join(baseline, ...path.split('/')), 'utf8')).not.toContain('student edit')
    }
    expect((await workspaces.get(old.id)).headCommit).not.toBe(migrated.headCommit)
    const explorer = new ProjectExplorerService(workspaces, candidates, {} as FirmwareBaselineService)
    await candidates.createWorkspaceEntry(old.id, 'src', 'modules', true)
    await candidates.createWorkspaceEntry(old.id, '', 'empty', true)
    const createdHeader = await candidates.createWorkspaceEntry(old.id, 'src/modules', 'helper.h', false)
    expect(await readFile(join(root, 'src/modules/helper.h'), 'utf8')).toBe('#pragma once\n')
    await candidates.createWorkspaceEntry(old.id, 'src/modules', 'helper.c', false)
    const entries = (await explorer.getSnapshot(old.id)).nodes
    expect(entries.some(node => node.displayPath === 'empty' && node.kind === 'directory')).toBe(true)
    expect(entries.some(node => node.name === '.gitkeep')).toBe(false)
    await Promise.all([
      candidates.writeWorkspaceFile(old.id, createdHeader.path, '#pragma once\nint Helper(void);\n'),
      candidates.createWorkspaceEntry(old.id, '', 'notes.md', false)
    ])
    expect(await readFile(join(root, createdHeader.path), 'utf8')).toContain('Helper')
    for (const name of ['HELPER.C', 'helper.c']) await expect(candidates.createWorkspaceEntry(old.id, 'src/modules', name, false)).rejects.toThrow('同名')
    for (const name of ['../x', 'a/b', 'a\\b', 'NUL.h', 'COM1', 'LPT².c', 'x.', 'x ', 'a:b', '.git', '.gitkeep', 'robotdog.project.json']) {
      await expect(candidates.createWorkspaceEntry(old.id, '', name, false)).rejects.toThrow()
    }
    await expect(candidates.createWorkspaceEntry(old.id, '../', 'x.c', false)).rejects.toThrow()
    await expect(candidates.createWorkspaceEntry(old.id, 'missing', 'x.c', false)).rejects.toThrow()
    expect((await new WorkspaceService({ ...options, sandboxSourceResolver: async () => baseline }).get(old.id)).headCommit).not.toBe(migrated.headCommit)
    const git = new GitWorkspaceService()
    const failing = new CandidateService({ rootDir: options.rootDir, workspaces, git })
    const failure = vi.spyOn(git, 'commitFile').mockImplementationOnce(async (project, path) => { await promisify(execFile)(process.env.ROBOTDOG_GIT_EXE ?? 'git', ['add', '--force', '--', path], { cwd: project, windowsHide: true }); throw new Error('GIT_FAILED') })
    await expect(failing.createWorkspaceEntry(old.id, '', 'failed.c', false)).rejects.toThrow('GIT_FAILED')
    expect(await stat(join(root, 'failed.c')).then(() => true, () => false)).toBe(false)
    expect(await git.isClean(root)).toBe(true)
    failure.mockRestore()
    const diskFailure = new CandidateService({ rootDir: options.rootDir, workspaces, createFileWriter: async file => { await file.writeFile('partial'); throw new Error('ENOSPC') } })
    await expect(diskFailure.createWorkspaceEntry(old.id, '', 'disk-failed', true)).rejects.toThrow('ENOSPC')
    expect(await stat(join(root, 'disk-failed')).then(() => true, () => false)).toBe(false)
    await expect(diskFailure.createWorkspaceEntry(old.id, '', 'disk-failed.c', false)).rejects.toThrow('ENOSPC')
    expect(await stat(join(root, 'disk-failed.c')).then(() => true, () => false)).toBe(false)
    expect(await git.isClean(root)).toBe(true)
    await expect(candidates.createWorkspaceEntry(old.id, '', 'busy.c', false, () => { throw new Error('BUSY') })).rejects.toThrow('BUSY')
    await symlink(baseline, join(root, 'linked'), 'junction')
    expect(await listSandboxDirectories(root)).not.toContain('linked')
    await expect(assertSandboxParent(root, 'linked')).rejects.toThrow('父目录')
    await unlink(join(root, 'linked'))
    vi.spyOn(workspaces, 'completeDirectEdit').mockRejectedValueOnce(new Error('METADATA_FAILED'))
    await expect(candidates.createWorkspaceEntry(old.id, '', 'retained.c', false)).rejects.toThrow('检查点同步失败')
    expect(await stat(join(root, 'retained.c')).then(() => true, () => false)).toBe(true)
    expect(await git.isClean(root)).toBe(true)
    await expect(candidates.createWorkspaceEntry(old.id, '', 'retained.c', false)).rejects.toThrow('同名')
    const simultaneous = await Promise.allSettled([candidates.createWorkspaceEntry(old.id, '', 'once.c', false), candidates.createWorkspaceEntry(old.id, '', 'once.c', false)])
    expect(simultaneous.filter(result => result.status === 'fulfilled')).toHaveLength(1)

    await expect(candidates.writeWorkspaceFile(old.id, '../outside.c', 'bad')).rejects.toThrow()
    await expect(candidates.writeWorkspaceFile(old.id, 'robotdog.project.json', '{}')).rejects.toThrow()
    expect(isSandboxProjectPath('.GIT/config')).toBe(false)
    const second = await workspaces.create({ studentDisplayName: '另一位同学' })
    const secondRoot = await workspaces.getProjectRootForMain(second.id)
    expect(await readFile(join(secondRoot, 'Startup', 'startup.S'), 'utf8')).not.toContain('student edit')
    const lesson = await workspaces.createLessonAttempt({ courseId: 'test-course', lessonId: 'test-lesson', studentDisplayName: '测试同学' }, {
      workspacePurpose: 'mcu-lesson-attempt', templateRoot: baseline, templateId: 'test-template', templateVersion: 'test', lessonTitle: '课程',
      courseBinding: { courseId: 'test-course', lessonId: 'test-lesson', contentVersion: 1 }, allowedEditGlobs: ['src/**/*.c'], deniedGlobs: []
    })
    await expect(candidates.writeWorkspaceFile(lesson.id, 'Startup/startup.S', 'bad')).rejects.toThrow('只能查看')
    await expect(candidates.createWorkspaceEntry(lesson.id, 'src', 'new.c', false)).rejects.toThrow('自由工程')
  }, 90_000)
})
