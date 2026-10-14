import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { CourseService } from './course-service'
import { CandidateService } from './candidate-service'
import { GitWorkspaceService } from './git-workspace-service'
import { WorkspaceService } from './workspace-service'
import { EDITION_PROFILES } from '../../shared/edition'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function lessonFixture() {
  const root = await mkdtemp(join(tmpdir(), 'ti-config-save-'))
  roots.push(root)
  const courses = new CourseService({ rootDir: resolve('resources/courses/ti-mspm0-foundations'), templatesRoot: resolve('resources/workspace-templates'), includeDrafts: true })
  const spec = await courses.getWorkspaceCreationSpec('ti-mspm0-gpio-foundations', 'gpio-sysconfig-toggle')
  const workspaces = new WorkspaceService({ rootDir: root, templateRoot: spec.templateRoot, edition: EDITION_PROFILES['ti-mspm0-foundations'] })
  const workspace = await workspaces.createLessonAttempt({ courseId: spec.courseBinding.courseId, lessonId: spec.courseBinding.lessonId, studentDisplayName: '软件测试' }, spec)
  const candidates = new CandidateService({ rootDir: root, workspaces })
  const project = await workspaces.getProjectRootForMain(workspace.id)
  const git = new GitWorkspaceService()
  const initialMain = await readFile(join(project, 'src/main.c'), 'utf8')
  return { root, project, workspaces, workspace, candidates, git, initialMain }
}

it('saves application code after a real external SysConfig save and retains both checkpoints', async () => {
  const f = await lessonFixture()
  await copyFile(resolve('docs/courses/assets/ti-first-lesson-blue.syscfg'), join(f.project, 'gpio_toggle_output.syscfg'))
  const blueConfig = await readFile(join(f.project, 'gpio_toggle_output.syscfg'), 'utf8')
  const blueMain = f.initialMain.replace('= 500U', '= 1000U').replace('GPIO_LEDS_LED_GREEN_PIN', 'GPIO_LEDS_LED_BLUE_PIN')
  await f.candidates.writeWorkspaceFile(f.workspace.id, 'src/main.c', blueMain)
  expect(await readFile(join(f.project, 'gpio_toggle_output.syscfg'), 'utf8')).toBe(blueConfig)
  expect(await readFile(join(f.project, 'src/main.c'), 'utf8')).toBe(blueMain)
  expect(await f.git.isClean(f.project)).toBe(true)
  expect((await f.workspaces.history(f.workspace.id, 2)).map(entry => entry.message)).toEqual([
    'feat(student): save src/main.c', 'feat(student): save SysConfig gpio_toggle_output.syscfg'
  ])
}, 15_000)

it.each(['unrelated', 'target', 'untracked', 'staged'] as const)('preserves and rejects %s external changes instead of silently incorporating them', async (kind) => {
  const f = await lessonFixture()
  const config = join(f.project, 'gpio_toggle_output.syscfg')
  const changedConfig = (await readFile(config, 'utf8')) + '\n// External save\n'
  await writeFile(config, changedConfig)
  if (kind === 'unrelated') await writeFile(join(f.project, 'README.md'), 'external notes')
  if (kind === 'target') await writeFile(join(f.project, 'src/main.c'), f.initialMain + '\n// external application edit\n')
  if (kind === 'untracked') await writeFile(join(f.project, 'extra.syscfg'), '// extra file')
  if (kind === 'staged') {
    // Fixture-only staging: production users do not need to operate Git.
    const { execFile } = await import('node:child_process')
    await new Promise<void>((ok, fail) => execFile('git', ['add', '--', 'gpio_toggle_output.syscfg'], { cwd: f.project, windowsHide: true }, error => error ? fail(error) : ok()))
  }
  const before = await f.git.getHead(f.project)
  await expect(f.candidates.writeWorkspaceFile(f.workspace.id, kind === 'target' ? 'gpio_toggle_output.syscfg' : 'src/main.c', kind === 'target' ? changedConfig + '// requested\n' : f.initialMain.replace('= 500U', '= 1000U'))).rejects.toThrow('WORKSPACE_DIRTY')
  expect(await f.git.getHead(f.project)).toBe(before)
  expect(await readFile(config, 'utf8')).toBe(changedConfig)
  if (kind === 'unrelated') expect(await readFile(join(f.project, 'README.md'), 'utf8')).toBe('external notes')
  if (kind === 'target') expect(await readFile(join(f.project, 'src/main.c'), 'utf8')).toContain('external application edit')
}, 15_000)
