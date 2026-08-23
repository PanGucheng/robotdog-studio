import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { Arch, build, Platform } from 'electron-builder'

const execFileAsync = promisify(execFile)
const root = process.cwd()
const editionAliases = { fun: 'fun-line-following', mcu: 'mcu-foundations', 'fun-line-following': 'fun-line-following', 'mcu-foundations': 'mcu-foundations' }
const legacyInvocation = process.argv[2] === 'zip' || process.argv[2] === 'nsis'
const editionId = legacyInvocation ? 'fun-line-following' : editionAliases[process.argv[2]]
if (!editionId) throw new Error('Usage: node scripts/package-windows.mjs <fun|mcu> <zip|nsis> <provisional|formal>')
const targetArg = legacyInvocation ? process.argv[2] : process.argv[3]
const releaseArg = legacyInvocation ? process.argv[3] : process.argv[4]
const target = targetArg === 'nsis' ? 'nsis' : 'zip'
const formal = releaseArg === 'formal'
const edition = editionId === 'mcu-foundations' ? {
  appId: 'cn.robotdog.studio.mcu', productName: 'RobotDog Studio 单片机入门版', executableName: 'RobotDogStudio-MCU', artifactSlug: 'RobotDog-Studio-MCU',
  templateBase: 'resources/workspace-templates/ch32v203-mcu-foundations'
} : {
  appId: 'cn.robotdog.studio.fun', productName: 'RobotDog Studio 趣味巡线版', executableName: 'RobotDogStudio-Fun', artifactSlug: 'RobotDog-Studio-Fun',
  templateBase: 'resources/workspace-templates/ch32v203-robotdog'
}
const packageOutputRoot = join(root, 'release', `.stage-${editionId}-${target}`)
await rm(packageOutputRoot, { recursive: true, force: true })
const installerInclude = join(root, 'build', 'installer.nsh')
if (target === 'nsis' && !(await stat(installerInclude).then((info) => info.isFile(), () => false))) {
  throw new Error(`NSIS 安装器脚本缺失：${installerInclude}`)
}
const temporaryRoot = resolve(tmpdir())
const appDir = resolve(temporaryRoot, 'robotdog-studio-package-stage')
if (!appDir.startsWith(temporaryRoot)) throw new Error('打包临时目录越界')
await rm(appDir, { recursive: true, force: true })
await mkdir(appDir, { recursive: true })
await cp(join(root, 'out'), join(appDir, 'out'), { recursive: true })
await cp(join(root, 'config'), join(appDir, 'config'), { recursive: true })
await writeFile(join(appDir, 'config', 'edition.json'), `${JSON.stringify({ schemaVersion: 1, edition: editionId }, null, 2)}\n`)
await writeFile(join(appDir, 'package.json'), `${JSON.stringify({
  name: 'robotdog-studio-packaged', version: '0.1.0',
  description: formal ? 'RobotDog Studio offline package' : 'RobotDog Studio provisional offline test package',
  main: './out/main/index.cjs', author: 'RobotDog Studio contributors', license: 'UNLICENSED', type: 'module', dependencies: {}
}, null, 2)}\n`)

const baselineName = editionId === 'mcu-foundations' ? 'ch32v203-rhs' : 'ch32v203-robotdog'
const baselineTarget = `firmware-baselines/${baselineName}/current/source`
const baselineRoot = join(root, 'resources', 'firmware-baselines', baselineName)
const registry = JSON.parse(await readFile(join(baselineRoot, 'active.json'), 'utf8'))
const selectedTemplate = editionId === 'fun-line-following'
  ? (registry.studentTemplate ?? 'resources/workspace-templates/ch32v203-robotdog/2026.06')
  : (registry.studentTemplate ?? `${edition.templateBase}/${registry.shortCommit ?? '2026.06'}`)
const gitRoot = resolve(process.env.ROBOTDOG_PACKAGED_GIT_ROOT ?? 'C:\\Program Files\\Git')
if (!(await stat(join(gitRoot, 'cmd', 'git.exe')).then((info) => info.isFile(), () => false))) {
  throw new Error(`打包需要 Git for Windows：未找到 ${join(gitRoot, 'cmd', 'git.exe')}`)
}
const wchLinkDriverRoot = resolve(process.env.ROBOTDOG_WCHLINK_DRIVER_ROOT ?? 'C:\\WCH.CN\\WCHLinkDrv')
if (!(await stat(join(wchLinkDriverRoot, 'WCHLinkWDM.INF')).then((info) => info.isFile(), () => false))) {
  throw new Error(`打包需要 WCH-Link 驱动：未找到 ${join(wchLinkDriverRoot, 'WCHLinkWDM.INF')}`)
}
const packagedGitRoot = join(appDir, 'toolchains', 'git')
await preparePackagedGitRuntime(gitRoot, packagedGitRoot)
const externalFirmware = resolve(process.env.ROBOTDOG_PACKAGED_FIRMWARE_ROOT ?? (editionId === 'mcu-foundations' ? join(root, 'firmware', 'ch32v203-baseline') : (registry.schemaVersion === 2 ? join(root, '.firmware-sources', 'ch32v203-robot-dog') : join(root, '..', 'ch32v203-robot-dog'))))
const manifestRef = registry.schemaVersion === 2 ? registry.verifiedFirmwareManifest : registry.manifest
const manifest = JSON.parse(await readFile(join(baselineRoot, manifestRef), 'utf8'))
const reasonixRuntime = JSON.parse(await readFile(join(root, 'config', 'reasonix-runtime.json'), 'utf8'))
if (typeof reasonixRuntime.binaryRelativePath !== 'string' || !reasonixRuntime.binaryRelativePath.startsWith('resources/tools/')) {
  throw new Error('Reasonix runtime manifest path invalid')
}
const reasonixToolPath = reasonixRuntime.binaryRelativePath.slice('resources/'.length).replace(/\\/g, '/').replace(/\/reasonix\.exe$/, '')
if (registry.schemaVersion === 2) {
  for (const source of ['CMakeLists.txt', 'CMakePresets.json', 'robotdog.firmware.json']) {
    if (!(await stat(join(externalFirmware, source))).isFile()) throw new Error(`待打包 SDK 缺少源文件：${source}`)
  }
  console.log(`Verified live firmware baseline: ${registry.activeCommit} (${externalFirmware})`)
} else {
  for (const item of manifest.integrity) {
    const source = join(externalFirmware, item.path)
    const actual = createHash('sha256').update(await readFile(source)).digest('hex')
    if (actual !== item.sha256) throw new Error(`待打包 SDK 与活动基线不一致：${item.path}`)
  }
  for (const source of manifest.build.sources) {
    if (!(await stat(join(externalFirmware, source))).isFile()) throw new Error(`待打包 SDK 缺少源文件：${source}`)
  }
  console.log(`Verified packaged firmware baseline: ${manifest.id} (${externalFirmware})`)
}
const extraResources = [
  { from: resolve(root, selectedTemplate), to: selectedTemplate.replace(/^resources[\\/]/, '').replaceAll('\\', '/') },
  ...(editionId === 'mcu-foundations' ? [{ from: join(root, 'resources', 'courses', 'mcu-foundations'), to: 'courses/mcu-foundations' }] : []),
  ...(editionId === 'mcu-foundations' ? [{ from: join(root, 'resources', 'workspace-templates', 'ch32v203-mcu-lessons'), to: 'workspace-templates/ch32v203-mcu-lessons' }] : []),
  { from: join(root, 'resources', 'firmware-baselines'), to: 'firmware-baselines' },
  { from: join(root, 'resources', 'board-profiles'), to: 'board-profiles' },
  { from: join(root, 'resources', reasonixToolPath), to: reasonixToolPath },
  { from: join(root, 'vendor', 'wch'), to: 'toolchains/wch' },
  { from: wchLinkDriverRoot, to: 'toolchains/wch/drivers/WCHLinkDrv' },
  { from: packagedGitRoot, to: 'toolchains/git' },
  {
    from: externalFirmware,
    to: baselineTarget,
    filter: [
      'CMakeLists.txt',
      'CMakePresets.json',
      'robotdog.firmware.json',
      'README.md',
      'Core/**/*', 'RHS_HAL/**/*', 'Board/**/*',
      'Debug/**/*',
      'Peripheral/**/*',
      'Startup/**/*',
      'User/**/*',
      'Ld/**/*',
      'cmake/**/*',
      'student-config/**/*',
      'tools/**/*'
    ]
  }
]

const artifacts = await build({
  projectDir: appDir,
  targets: Platform.WINDOWS.createTarget([target], Arch.x64),
  config: {
    appId: edition.appId,
    electronVersion: '42.4.1',
    productName: formal ? edition.productName : `${edition.productName} 临时测试版`,
    copyright: 'Copyright © 2026 RobotDog Studio contributors',
    asar: true,
    npmRebuild: false,
    compression: 'normal',
    directories: { output: packageOutputRoot },
    files: ['out/**/*', 'config/**/*', 'package.json'],
    extraResources,
    win: {
      executableName: formal ? edition.executableName : `${edition.executableName}-Test`,
      requestedExecutionLevel: 'asInvoker'
    },
    ...(target === 'nsis' ? {
      nsis: {
        perMachine: true,
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        include: installerInclude
      }
    } : {}),
    artifactName: formal ? `${edition.artifactSlug}-\${version}-Windows-\${arch}.\${ext}` : `${edition.artifactSlug}-\${version}-PROVISIONAL-Windows-\${arch}.\${ext}`,
    publish: null
  }
})
console.log('Windows package artifacts:')
for (const artifact of artifacts) {
  const destination = join(root, 'release', basename(artifact))
  await rm(destination, { force: true })
  await rename(artifact, destination)
  console.log(`- ${destination}`)
}
const packagedResourcesRoot = join(packageOutputRoot, 'win-unpacked', 'resources')
await verifyPackagedFirmwareSource(join(packagedResourcesRoot, baselineTarget))
await verifyPackagedWorkspaceTemplate(resolvePackagedResource(packagedResourcesRoot, selectedTemplate), editionId)
if (editionId === 'mcu-foundations') await verifyPackagedCourseResources(join(packagedResourcesRoot, 'courses', 'mcu-foundations'), join(packagedResourcesRoot, 'workspace-templates', 'ch32v203-mcu-lessons'))
await verifyPackagedWchLinkDriver(join(packagedResourcesRoot, 'toolchains', 'wch', 'drivers', 'WCHLinkDrv'))

async function preparePackagedGitRuntime(sourceRoot, destinationRoot) {
  await rm(destinationRoot, { recursive: true, force: true })
  await mkdir(join(destinationRoot, 'cmd'), { recursive: true })
  await cp(join(sourceRoot, 'cmd', 'git.exe'), join(destinationRoot, 'cmd', 'git.exe'))
  await cp(join(sourceRoot, 'mingw64', 'bin'), join(destinationRoot, 'mingw64', 'bin'), { recursive: true })
  await cp(join(sourceRoot, 'mingw64', 'libexec', 'git-core'), join(destinationRoot, 'mingw64', 'libexec', 'git-core'), { recursive: true })
  await cp(join(sourceRoot, 'mingw64', 'share', 'git-core', 'templates'), join(destinationRoot, 'mingw64', 'share', 'git-core', 'templates'), { recursive: true })

  const gitExe = join(destinationRoot, 'cmd', 'git.exe')
  const probeRoot = await mkdtemp(join(tmpdir(), 'robotdog-packaged-git-'))
  try {
    const probeRepo = join(probeRoot, 'repo')
    await mkdir(probeRepo)
    await execFileAsync(gitExe, ['init', '--initial-branch=main'], { cwd: probeRepo, windowsHide: true })
    await writeFile(join(probeRepo, 'probe.txt'), 'RobotDog Studio packaged Git probe\n', 'utf8')
    await execFileAsync(gitExe, ['add', '--all'], { cwd: probeRepo, windowsHide: true })
    await execFileAsync(gitExe, ['-c', 'user.name=RobotDog Studio', '-c', 'user.email=studio@robotdog.local', 'commit', '-m', 'probe packaged git'], { cwd: probeRepo, windowsHide: true })
    const { stdout } = await execFileAsync(gitExe, ['rev-parse', '--short', 'HEAD'], { cwd: probeRepo, windowsHide: true, encoding: 'utf8' })
    console.log(`Verified packaged Git runtime: ${stdout.trim()} (${gitExe})`)
  } finally {
    await rm(probeRoot, { recursive: true, force: true })
  }
}

async function verifyPackagedFirmwareSource(sourceRoot) {
  if (editionId === 'mcu-foundations') {
    for (const item of ['CMakeLists.txt', 'CMakePresets.json', 'robotdog.firmware.json', 'Core/core_riscv.c', 'RHS_HAL/Inc/rhs_hal.h', 'Board/Inc/rhs_board.h', 'Startup/startup_ch32v20x_D6.S', 'Ld/Link.ld']) {
      if (!(await stat(join(sourceRoot, ...item.split('/'))).then((info) => info.isFile(), () => false))) throw new Error(`打包后的 RHS 固件源码缺少必要文件：${item}`)
    }
    console.log(`Verified packaged RHS firmware source files (${sourceRoot})`)
    return
  }
  const required = [
    'CMakeLists.txt',
    'CMakePresets.json',
    'robotdog.firmware.json',
    'cmake/robotdog-wch-gcc12.cmake',
    'student-config/line-following.yaml',
    'tools/generate_student_config.py',
    'tools/run_size.py',
    'tools/artifact_hashes.py',
    'tools/source_input_hash.py'
  ]
  for (const item of required) {
    const path = join(sourceRoot, ...item.split('/'))
    if (!(await stat(path).then((info) => info.isFile(), () => false))) throw new Error(`打包后的固件源码缺少必要文件：${item}`)
  }
  console.log(`Verified packaged firmware source files: ${required.length} required files (${sourceRoot})`)
}

function resolvePackagedResource(resourcesRoot, resourcePath) {
  const normalized = String(resourcePath).replace(/\\/g, '/')
  return normalized.startsWith('resources/') ? join(resourcesRoot, normalized.slice('resources/'.length)) : join(resourcesRoot, normalized)
}

async function verifyPackagedWorkspaceTemplate(templateRoot, currentEdition) {
  if (currentEdition === 'mcu-foundations' && (await stat(join(templateRoot, 'Core')).then((info) => !info.isDirectory(), () => true))) {
    for (const item of ['README.md', 'App/Src/experiment.c', 'App/Inc/experiment.h']) {
      if (!(await stat(join(templateRoot, ...item.split('/'))).then((info) => info.isFile(), () => false))) throw new Error(`打包后的 RHS 教学模板缺少必要文件：${item}`)
    }
    console.log(`Verified packaged RHS lesson template (${templateRoot})`)
    return
  }
  const required = currentEdition === 'mcu-foundations' ? [
    'README.md',
    'App/Src/experiment.c',
    'App/Inc/experiment.h',
    'Core/Src/student_control.c',
    'Core/Inc/student_control.h',
    'student-config/line-following.yaml'
  ] : [
    'README.md',
    'Core/Src/student_control.c',
    'Core/Inc/student_control.h',
    'student-config/line-following.yaml'
  ]
  for (const item of required) {
    const path = join(templateRoot, ...item.split('/'))
    if (!(await stat(path).then((info) => info.isFile(), () => false))) throw new Error(`打包后的学生模板缺少必要文件：${item}`)
  }
  console.log(`Verified packaged workspace template files: ${required.length} required files (${templateRoot})`)
}

async function verifyPackagedCourseResources(courseRoot, lessonTemplatesRoot) {
  const catalog = JSON.parse(await readFile(join(courseRoot, 'catalog.json'), 'utf8'))
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.courses) || catalog.courses.length === 0) throw new Error('打包后的课程目录无效')
  let lessonCount = 0
  let lectureCount = 0
  let lectureAssetCount = 0
  for (const entry of catalog.courses) {
    const manifestPath = join(courseRoot, ...String(entry.manifest).replace(/\\/g, '/').split('/'))
    const course = JSON.parse(await readFile(manifestPath, 'utf8'))
    for (const lessonId of course.lessonOrder ?? []) {
      const lessonPath = join(manifestPath, '..', 'lessons', `${lessonId}.json`)
      if (!(await stat(lessonPath).then((info) => info.isFile(), () => false))) throw new Error(`打包后的课程缺少课次：${lessonId}`)
      const lesson = JSON.parse(await readFile(lessonPath, 'utf8'))
      if (!(await stat(join(lessonTemplatesRoot, lesson.templateId)).then((info) => info.isDirectory(), () => false))) throw new Error(`打包后的课程缺少模板：${lesson.templateId}`)
      if (lesson.status === 'published') {
        const lecturePath = join(manifestPath, '..', 'lectures', lessonId, 'lecture.md')
        if (!(await stat(lecturePath).then((info) => info.isFile(), () => false))) throw new Error(`打包后的正式课缺少讲义：${lessonId}`)
        const markdown = await readFile(lecturePath, 'utf8')
        const assets = [...markdown.matchAll(/!\[[^\]]*\]\((assets\/[a-zA-Z0-9._/-]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1])
        for (const asset of assets) {
          if (!(await stat(join(lecturePath, '..', ...asset.split('/'))).then((info) => info.isFile(), () => false))) throw new Error(`打包后的讲义缺少图片：${lessonId}/${asset}`)
        }
        lectureCount += 1
        lectureAssetCount += assets.length
      }
      lessonCount += 1
    }
  }
  console.log(`Verified packaged MCU course resources: ${catalog.courses.length} courses, ${lessonCount} lessons, ${lectureCount} lectures, ${lectureAssetCount} assets (${courseRoot})`)
}

async function verifyPackagedWchLinkDriver(driverRoot) {
  const required = [
    'WCHLinkWDM.INF',
    'WCHLinkWDM.CAT',
    'WCHLinkW64.sys',
    'WCHLinkM64.sys',
    'WCHLinkWDM.sys',
    'WCHLinkDll.dll',
    'SETUP.EXE',
    'DRVSETUP64/DRVSETUP64.exe'
  ]
  for (const item of required) {
    const path = join(driverRoot, ...item.split('/'))
    if (!(await stat(path).then((info) => info.isFile(), () => false))) throw new Error(`打包后的 WCH-Link 驱动缺少必要文件：${item}`)
  }
  console.log(`Verified packaged WCH-Link driver files: ${required.length} required files (${driverRoot})`)
}
