import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitWorkspaceService } from './git-workspace-service'
import { WorkspaceService } from './workspace-service'
import { EDITION_PROFILES } from '../../shared/edition'

describe('WorkspaceService', () => {
  let sandbox: string
  let dataRoot: string
  let templateRoot: string

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'robotdog-workspace-测试 path-'))
    dataRoot = join(sandbox, '学生 数据')
    templateRoot = join(sandbox, 'template')
    await mkdir(join(templateRoot, 'Core', 'Src'), { recursive: true })
    await writeFile(join(templateRoot, 'Core', 'Src', 'student.c'), 'void student(void) {}\n')
  })

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true })
  })

  it('creates a managed Git workspace for Chinese names and paths with spaces', async () => {
    const service = new WorkspaceService({ rootDir: dataRoot, templateRoot })
    const created = await service.create({ name: '巡线 基础训练', studentDisplayName: '林同学' })

    expect(created.name).toBe('巡线 基础训练')
    expect(created.learningPath).toBe('fun-line-following')
    expect(created.workspacePurpose).toBe('fun-project')
    expect(created.headCommit).toMatch(/^[a-f0-9]{40}$/)
    expect(await service.list()).toEqual([created])
    expect((await service.history(created.id))[0]).toMatchObject({ message: 'chore: initialize student workspace' })

    const projectRoot = join(dataRoot, 'workspaces', created.id, 'project')
    expect(await readFile(join(projectRoot, '.robotdog-managed'), 'utf8')).toContain('workspace v1')
    expect(JSON.parse(await readFile(join(projectRoot, 'robotdog.project.json'), 'utf8')).policyProfile).toBe('student-v1')
  })

  it('rejects renderer-style extra path fields', async () => {
    const service = new WorkspaceService({ rootDir: dataRoot, templateRoot })
    await expect(service.create({ name: '训练', studentDisplayName: '小林', projectRoot: 'C:\\Users\\someone' } as never)).rejects.toThrow()
    expect(await service.list()).toEqual([])
  })

  it('creates dated unique conversation names and persists user renames', async () => {
    const service = new WorkspaceService({ rootDir: dataRoot, templateRoot })
    const first = await service.create({ studentDisplayName: '林同学' })
    const second = await service.create({ studentDisplayName: '林同学' })

    expect(first.name).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} 巡线练习$/)
    expect(second.name).toBe(`${first.name}（2）`)
    expect(first.id).not.toBe(second.id)
    expect(first.createdAt).toMatch(/T/)

    const renamed = await service.renameWorkspace(first.id, '第一次过弯实验')
    expect(renamed.name).toBe('第一次过弯实验')
    expect(renamed.id).toBe(first.id)
    expect(renamed.headCommit).toBe(first.headCommit)
    expect((await service.get(first.id)).name).toBe('第一次过弯实验')
  })

  it('rolls back the temporary directory when Git initialization fails', async () => {
    class FailingGitService extends GitWorkspaceService {
      override async initialize(): Promise<string> { throw new Error('simulated git failure') }
    }
    const service = new WorkspaceService({ rootDir: dataRoot, templateRoot, git: new FailingGitService() })
    await expect(service.create({ name: '回滚训练', studentDisplayName: '小林' })).rejects.toThrow('simulated git failure')
    expect(await readdir(join(dataRoot, 'workspaces'))).toEqual([])
  })

  it('rejects linked directories in a template without leaving a workspace', async () => {
    const target = join(sandbox, 'outside')
    await mkdir(target)
    await writeFile(join(target, 'secret.c'), 'secret')
    await symlink(target, join(templateRoot, 'Core', 'linked'), 'junction')
    const service = new WorkspaceService({ rootDir: dataRoot, templateRoot })

    await expect(service.create({ name: '安全训练', studentDisplayName: '小林' })).rejects.toThrow('WORKSPACE_TEMPLATE_LINK_DENIED')
    expect(await service.list()).toEqual([])
  })

  it('ignores foreign directories and rejects foreign repositories', async () => {
    const service = new WorkspaceService({ rootDir: dataRoot, templateRoot })
    await service.initialize()
    await mkdir(join(dataRoot, 'workspaces', 'ws_aaaaaaaaaaaaaaaaaaaaaaaa'), { recursive: true })
    expect(await service.list()).toEqual([])
    await expect(service.get('ws_aaaaaaaaaaaaaaaaaaaaaaaa')).rejects.toThrow()
  })

  it('migrates v1 metadata to the fun edition without changing the Git project', async () => {
    const service = new WorkspaceService({ rootDir: dataRoot, templateRoot })
    const created = await service.create({ name: '旧巡线项目', studentDisplayName: '小林' })
    const metadataPath = join(dataRoot, 'workspaces', created.id, 'workspace.json')
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
    delete metadata.learningPath
    delete metadata.workspacePurpose
    delete metadata.courseBinding
    delete metadata.platform
    delete metadata.target
    delete metadata.toolchainProfile
    metadata.schemaVersion = 1
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)

    const migrated = await service.get(created.id)
    expect(migrated.learningPath).toBe('fun-line-following')
    expect(JSON.parse(await readFile(metadataPath, 'utf8')).schemaVersion).toBe(4)
    expect(JSON.parse(await readFile(`${metadataPath}.v1.bak`, 'utf8')).schemaVersion).toBe(1)
    expect((await service.history(created.id))[0].commit).toBe(created.headCommit)
  })

  it('creates MCU projects from its own edition and refuses them in the fun edition', async () => {
    const mcu = new WorkspaceService({ rootDir: dataRoot, templateRoot, edition: EDITION_PROFILES['mcu-foundations'] })
    const created = await mcu.create({ studentDisplayName: '陈同学' })
    expect(created.name).toMatch(/单片机练习$/)
    expect(created).toMatchObject({ learningPath: 'mcu-foundations', workspacePurpose: 'mcu-sandbox', templateId: 'ch32v203-mcu-foundations' })
    expect(JSON.parse(await readFile(join(dataRoot, 'workspaces', created.id, 'project', 'robotdog.project.json'), 'utf8')).policyProfile).toBe('mcu-foundations-v1')

    const fun = new WorkspaceService({ rootDir: dataRoot, templateRoot })
    await expect(fun.get(created.id)).rejects.toThrow('WORKSPACE_EDITION_MISMATCH')
  })

  it('migrates an existing v2 MCU workspace to a sandbox and preserves its project', async () => {
    const mcu = new WorkspaceService({ rootDir: dataRoot, templateRoot, edition: EDITION_PROFILES['mcu-foundations'] })
    const created = await mcu.create({ name: '旧 MCU 项目', studentDisplayName: '陈同学' })
    const metadataPath = join(dataRoot, 'workspaces', created.id, 'workspace.json')
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
    delete metadata.workspacePurpose
    delete metadata.courseBinding
    delete metadata.platform
    delete metadata.target
    delete metadata.toolchainProfile
    metadata.schemaVersion = 2
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)

    const migrated = await mcu.get(created.id)
    expect(migrated.workspacePurpose).toBe('mcu-sandbox')
    expect(JSON.parse(await readFile(metadataPath, 'utf8')).schemaVersion).toBe(4)
    expect(JSON.parse(await readFile(`${metadataPath}.v2.bak`, 'utf8')).schemaVersion).toBe(2)
    expect((await mcu.history(created.id))[0].commit).toBe(created.headCommit)
  })

  it('creates independent numbered lesson attempts with lesson-specific templates and policy', async () => {
    const lessonTemplate = join(sandbox, 'lesson-template')
    await mkdir(join(lessonTemplate, 'App', 'Src'), { recursive: true })
    await mkdir(join(lessonTemplate, 'App', 'Inc'), { recursive: true })
    await mkdir(join(lessonTemplate, 'Core', 'Src'), { recursive: true })
    await mkdir(join(lessonTemplate, 'Core', 'Inc'), { recursive: true })
    await writeFile(join(lessonTemplate, 'App', 'Src', 'lesson.c'), 'void lesson(void) {}\n')
    await writeFile(join(lessonTemplate, 'App', 'Inc', 'lesson.h'), 'void lesson(void);\n')
    await writeFile(join(lessonTemplate, 'Core', 'Src', 'student_control.c'), 'void student(void) {}\n')
    await writeFile(join(lessonTemplate, 'Core', 'Inc', 'student_control.h'), 'void student(void);\n')
    const service = new WorkspaceService({ rootDir: dataRoot, templateRoot, edition: EDITION_PROFILES['mcu-foundations'] })
    const spec = {
      workspacePurpose: 'mcu-lesson-attempt' as const,
      templateId: 'lesson-template', templateVersion: 'content-v1', templateRoot: lessonTemplate,
      courseBinding: { courseId: 'course-one', lessonId: 'lesson-one', contentVersion: 1 },
      lessonTitle: '第一课',
      allowedEditGlobs: ['App/Src/lesson.c'], deniedGlobs: ['Core/**']
    }
    const first = await service.createLessonAttempt({ courseId: 'course-one', lessonId: 'lesson-one', studentDisplayName: '陈同学' }, spec)
    const second = await service.createLessonAttempt({ courseId: 'course-one', lessonId: 'lesson-one', studentDisplayName: '陈同学' }, spec)

    expect(first).toMatchObject({ workspacePurpose: 'mcu-lesson-attempt', name: '第一课 · 第 1 次', courseBinding: { attemptNumber: 1 } })
    expect(second).toMatchObject({ name: '第一课 · 第 2 次', courseBinding: { attemptNumber: 2 } })
    expect((await service.listLessonAttempts('course-one', 'lesson-one')).map((item) => item.courseBinding?.attemptNumber).sort()).toEqual([1, 2])
    expect(await readFile(join(dataRoot, 'workspaces', first.id, 'project', 'App', 'Src', 'lesson.c'), 'utf8')).toContain('lesson')
    const policy = JSON.parse(await readFile(join(dataRoot, 'workspaces', first.id, 'project', 'robotdog.project.json'), 'utf8'))
    expect(policy.allowedEditGlobs).toEqual(['App/Src/lesson.c'])
    expect(policy.deniedGlobs).toContain('Core/**')
  })
})
