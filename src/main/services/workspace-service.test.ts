import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitWorkspaceService } from './git-workspace-service'
import { WorkspaceService } from './workspace-service'

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
})
