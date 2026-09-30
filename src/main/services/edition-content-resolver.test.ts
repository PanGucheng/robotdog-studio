import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EditionContentResolver } from './edition-content-resolver'

const temporaryDirs: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('EditionContentResolver', () => {
  async function createMockEnvironment(): Promise<{ staticRoot: string; userDataContentRoot: string }> {
    const root = await mkdtemp(join(tmpdir(), 'resolver-test-'))
    temporaryDirs.push(root)
    const staticRoot = join(root, 'resources')
    const userDataContentRoot = join(root, 'userData', 'content')

    // Create static files
    await mkdir(join(staticRoot, 'courses', 'mcu-foundations'), { recursive: true })
    await mkdir(join(staticRoot, 'workspace-templates'), { recursive: true })
    await mkdir(join(staticRoot, 'firmware-baselines'), { recursive: true })

    // Create downloaded files in userData
    const mcuCurrent = join(userDataContentRoot, 'mcu-foundations', 'current')
    await mkdir(join(mcuCurrent, 'courses'), { recursive: true })
    await mkdir(join(mcuCurrent, 'workspace-templates', 'ch32v203-mcu-lessons'), { recursive: true })
    await mkdir(join(mcuCurrent, 'firmware-baselines', 'ch32v203-rhs'), { recursive: true })
    await writeFile(
      join(mcuCurrent, 'courses', 'catalog.json'),
      JSON.stringify({ schemaVersion: 1, courses: [{ courseId: 'ch32v203-foundations', manifest: 'ch32v203-foundations/course.json' }] }),
      'utf8'
    )

    return { staticRoot, userDataContentRoot }
  }

  it('prefers downloaded content in packaged / student mode (preferLocal: false)', async () => {
    const { staticRoot, userDataContentRoot } = await createMockEnvironment()
    const resolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot,
      editionId: 'mcu-foundations',
      preferLocal: false
    })

    expect(resolver.isPreferLocal()).toBe(false)
    expect(resolver.hasValidDownloadedContent('mcu-foundations')).toBe(true)
    expect(resolver.resolveCourseRoot()).toBe(join(userDataContentRoot, 'mcu-foundations', 'current', 'courses'))
    expect(resolver.resolveWorkspaceTemplateRoot()).toBe(join(userDataContentRoot, 'mcu-foundations', 'current', 'workspace-templates'))
    expect(resolver.resolveFirmwareBaselineRoot()).toBe(join(userDataContentRoot, 'mcu-foundations', 'current', 'firmware-baselines'))
  })

  it('prefers local author resources in development / authoring mode (preferLocal: true)', async () => {
    const { staticRoot, userDataContentRoot } = await createMockEnvironment()
    const resolver = new EditionContentResolver({
      staticRoot,
      userDataContentRoot,
      editionId: 'mcu-foundations',
      preferLocal: true
    })

    expect(resolver.isPreferLocal()).toBe(true)
    // Even though valid downloaded content exists, author environment resolves directly to static resources
    expect(resolver.resolveCourseRoot()).toBe(join(staticRoot, 'courses', 'mcu-foundations'))
    expect(resolver.resolveWorkspaceTemplateRoot()).toBe(join(staticRoot, 'workspace-templates'))
    expect(resolver.resolveFirmwareBaselineRoot()).toBe(join(staticRoot, 'firmware-baselines'))
  })
})
