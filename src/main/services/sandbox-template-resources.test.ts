import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { EDITION_PROFILES } from '../../shared/edition'
import { exportPublishedSnapshot } from './published-snapshot'
import { resolveSandboxTemplateResources } from './sandbox-template-resources'
import { FirmwareBaselineService } from './firmware-baseline-service'
import { FirmwareBaselineResolver } from './firmware-baseline-resolver'
import { WorkspaceService } from './workspace-service'

const roots: string[] = []
const repo = process.cwd()
const staticRoot = join(repo, 'resources')
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it.each(['sdk-empty', 'pony'] as const)('uses updated %s sources for new workspaces and preserves existing student code', async (projectType) => {
  const root = await mkdtemp(join(tmpdir(), 'ti-sandbox-content-'))
  roots.push(root)
  const directory = `ti-mspm0g3507-${projectType}`
  const bundled = resolveSandboxTemplateResources(staticRoot, join(staticRoot, 'workspace-templates'), join(staticRoot, 'firmware-baselines'), directory)
  const originalManifest = await new FirmwareBaselineService({ manifestPath: bundled.manifestPath, developmentSourceRoot: bundled.templateRoot }).getManifest()
  const workspaceOptions = (templateRoot: string) => ({ rootDir: join(root, 'students'), templateRoot,
    edition: EDITION_PROFILES['ti-mspm0-foundations'], sandboxTemplates: { [projectType]: {
      templateRoot, templateId: directory, templateVersion: '1', firmwareBaselineId: originalManifest.id, baselineCommit: originalManifest.source.expectedCommit
    } } })
  const before = new WorkspaceService(workspaceOptions(bundled.templateRoot))
  const oldWorkspace = await before.create({ studentDisplayName: '学生', projectType })
  const oldMainPath = join(await before.getProjectRootForMain(oldWorkspace.id), 'src/main.c')
  const studentCode = `${await readFile(oldMainPath, 'utf8')}\n/* student work before content update */\n`
  await writeFile(oldMainPath, studentCode)

  const downloaded = join(root, 'content')
  exportPublishedSnapshot({ editionId: 'ti-mspm0-foundations', studioRoot: repo, outputDir: downloaded })
  const selected = resolveSandboxTemplateResources(staticRoot, join(downloaded, 'workspace-templates'), join(downloaded, 'firmware-baselines'), directory)
  const newMain = `${await readFile(join(selected.templateRoot, 'src/main.c'), 'utf8')}\n/* downloaded template revision */\n`
  await writeFile(join(selected.templateRoot, 'src/main.c'), newMain)
  await writeFile(join(downloaded, 'firmware-baselines', directory, 'current/source/src/main.c'), newMain)
  const manifestPath = join(downloaded, 'firmware-baselines', directory, 'manifest.json')
  const newManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  newManifest.integrity.find((item: { path: string }) => item.path === 'src/main.c').sha256 = createHash('sha256').update(newMain).digest('hex')
  await writeFile(manifestPath, JSON.stringify(newManifest))

  const baseline = new FirmwareBaselineService({ manifestPath: selected.manifestPath, developmentSourceRoot: selected.templateRoot })
  expect(await baseline.getStatus()).toMatchObject({ sourceRoot: selected.templateRoot, releaseEligible: true, errors: [] })
  const resolver = new FirmwareBaselineResolver({ staticRoot, firmwareBaselinesRoot: join(downloaded, 'firmware-baselines'), isPackaged: false })
  expect(await resolver.resolve(originalManifest.id).getStatus()).toMatchObject({ sourceRoot: join(downloaded, 'firmware-baselines', directory, 'current/source'), releaseEligible: true, errors: [] })
  const after = new WorkspaceService(workspaceOptions(selected.templateRoot))
  const newWorkspace = await after.create({ studentDisplayName: '学生', projectType })
  expect(await readFile(join(await after.getProjectRootForMain(newWorkspace.id), 'src/main.c'), 'utf8')).toBe(newMain)
  expect((await after.get(oldWorkspace.id)).id).toBe(oldWorkspace.id)
  expect(await readFile(oldMainPath, 'utf8')).toBe(studentCode)
}, 15_000)

it('falls back to a matched bundled pair when older downloaded content omits the sandbox baseline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ti-sandbox-legacy-'))
  roots.push(root)
  const directory = 'ti-mspm0g3507-pony'
  await mkdir(join(root, 'workspace-templates', directory), { recursive: true })
  expect(resolveSandboxTemplateResources(staticRoot, join(root, 'workspace-templates'), join(root, 'firmware-baselines'), directory)).toEqual({
    templateRoot: join(staticRoot, 'workspace-templates', directory),
    manifestPath: join(staticRoot, 'firmware-baselines', directory, 'active.json')
  })
})
