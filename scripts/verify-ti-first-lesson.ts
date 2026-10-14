import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { CourseService } from '../src/main/services/course-service'
import { TiMspm0BuildService } from '../src/main/services/ti-mspm0-build-service'
import { TiMspm0ToolchainService } from '../src/main/services/ti-mspm0-toolchain-service'
import { WorkspaceService } from '../src/main/services/workspace-service'
import { CandidateService } from '../src/main/services/candidate-service'
import { EDITION_PROFILES } from '../src/shared/edition'

// Software-only author validation. This script never probes or flashes a board.
const root = await mkdtemp(join(tmpdir(), 'ti-first-lesson-validation-'))
try {
  const courses = new CourseService({ rootDir: resolve('resources/courses/ti-mspm0-foundations'), templatesRoot: resolve('resources/workspace-templates'), includeDrafts: true })
  const spec = await courses.getWorkspaceCreationSpec('ti-mspm0-gpio-foundations', 'gpio-sysconfig-toggle')
  const workspaces = new WorkspaceService({ rootDir: root, templateRoot: spec.templateRoot, templateVersion: spec.templateVersion,
    firmwareBaselineId: 'ti-mspm0g3507-sdk-2.11.00.07', baselineCommit: '2110000700000000000000000000000000000000', edition: EDITION_PROFILES['ti-mspm0-foundations'] })
  const workspace = await workspaces.createLessonAttempt({ courseId: spec.courseBinding.courseId, lessonId: spec.courseBinding.lessonId, studentDisplayName: '作者软件验收' }, spec)
  const project = await workspaces.getProjectRootForMain(workspace.id)
  const main = join(project, 'src/main.c')
  const initial = await readFile(main, 'utf8')
  const candidates = new CandidateService({ rootDir: root, workspaces })
  const build = new TiMspm0BuildService(new TiMspm0ToolchainService(), workspaces, join(root, 'artifacts'))
  async function verify(label: string): Promise<void> {
    const result = await build.build({ workspaceId: workspace.id })
    if (result.state !== 'completed') throw new Error(`${label}: ${result.error}`)
    await build.requireCurrentArtifact(workspace.id, 'elf')
    if (result.proof?.releaseEligible !== false) throw new Error('Software verification must not claim hardware release eligibility')
    console.log(`${label}: PASS flash=${result.size!.text + result.size!.data} ram=${result.size!.data + result.size!.bss}`)
  }
  await verify('green-500ms')
  await candidates.writeWorkspaceFile(workspace.id, 'src/main.c', initial.replace('= 500U', '= 1000U'))
  await verify('green-1000ms')
  await copyFile(resolve('docs/courses/assets/ti-first-lesson-blue.syscfg'), join(project, 'gpio_toggle_output.syscfg'))
  let staleRejected = false
  try { await build.requireCurrentArtifact(workspace.id, 'elf') } catch (error) { staleRejected = /SysConfig 配置已经变化/.test(String(error)) }
  if (!staleRejected) throw new Error('External SysConfig save did not invalidate the old ELF')
  console.log('external-sysconfig-save: old ELF rejected')
  await candidates.writeWorkspaceFile(workspace.id, 'src/main.c', initial.replace('= 500U', '= 1000U').replace('GPIO_LEDS_LED_GREEN_PIN', 'GPIO_LEDS_LED_BLUE_PIN'))
  console.log('external-sysconfig-to-application-save: PASS (Studio save service, both changes preserved)')
  await verify('blue-1000ms-from-real-GUI-save')
  const generated = await readFile(join(project, 'generated/ti_msp_dl_config.h'), 'utf8')
  if (!generated.includes('GPIO_LEDS_LED_BLUE_PIN') || !generated.includes('DL_GPIO_PIN_6')) throw new Error('Blue GPIO generation mismatch')
  await copyFile(resolve('resources/workspace-templates/ti-mspm0g3507-foundations/gpio_toggle_output.syscfg'), join(project, 'gpio_toggle_output.syscfg'))
  const invalid = await build.build({ workspaceId: workspace.id })
  if (invalid.state !== 'failed' || !invalid.logs.join('\n').includes('GPIO_LEDS_LED_BLUE_PIN')) throw new Error('Missing blue configuration did not fail clearly')
  console.log('missing-blue-config: build rejected')
  console.log('TI_FIRST_LESSON_SOFTWARE_OK hardware=not-tested flash=not-run')
} finally {
  const fromTemp = relative(tmpdir(), root)
  if (!fromTemp || fromTemp.startsWith('..') || isAbsolute(fromTemp)) throw new Error('Validation cleanup escaped the temporary directory')
  await rm(root, { recursive: true, force: true })
}
