import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { Arch, build, Platform } from 'electron-builder'

const execFileAsync = promisify(execFile)
const root = process.cwd()
const target = process.argv[2] === 'nsis' ? 'nsis' : 'zip'
const formal = process.argv[3] === 'formal'
const temporaryRoot = resolve(tmpdir())
const appDir = resolve(temporaryRoot, 'robotdog-studio-package-stage')
if (!appDir.startsWith(temporaryRoot)) throw new Error('打包临时目录越界')
await rm(appDir, { recursive: true, force: true })
await mkdir(appDir, { recursive: true })
await cp(join(root, 'out'), join(appDir, 'out'), { recursive: true })
await cp(join(root, 'config'), join(appDir, 'config'), { recursive: true })
await writeFile(join(appDir, 'package.json'), `${JSON.stringify({
  name: 'robotdog-studio-packaged', version: '0.1.0',
  description: formal ? 'RobotDog Studio offline package' : 'RobotDog Studio provisional offline test package',
  main: './out/main/index.cjs', author: 'RobotDog Studio contributors', license: 'UNLICENSED', type: 'module', dependencies: {}
}, null, 2)}\n`)

const baselineTarget = 'firmware-baselines/ch32v203-robotdog/current/source'
const baselineRoot = join(root, 'resources', 'firmware-baselines', 'ch32v203-robotdog')
const registry = JSON.parse(await readFile(join(baselineRoot, 'active.json'), 'utf8'))
const gitRoot = resolve(process.env.ROBOTDOG_PACKAGED_GIT_ROOT ?? 'C:\\Program Files\\Git')
if (!(await stat(join(gitRoot, 'cmd', 'git.exe')).then((info) => info.isFile(), () => false))) {
  throw new Error(`打包需要 Git for Windows：未找到 ${join(gitRoot, 'cmd', 'git.exe')}`)
}
const packagedGitRoot = join(appDir, 'toolchains', 'git')
await preparePackagedGitRuntime(gitRoot, packagedGitRoot)
const externalFirmware = resolve(process.env.ROBOTDOG_PACKAGED_FIRMWARE_ROOT ?? (registry.schemaVersion === 2 ? join(root, '.firmware-sources', 'ch32v203-robot-dog') : join(root, '..', 'ch32v203-robot-dog')))
const manifestRef = registry.schemaVersion === 2 ? registry.verifiedFirmwareManifest : registry.manifest
const manifest = JSON.parse(await readFile(join(baselineRoot, manifestRef), 'utf8'))
const reasonixRuntime = JSON.parse(await readFile(join(root, 'config', 'reasonix-runtime.json'), 'utf8'))
if (typeof reasonixRuntime.binaryRelativePath !== 'string' || !reasonixRuntime.binaryRelativePath.startsWith('resources/tools/')) {
  throw new Error('Reasonix runtime manifest path invalid')
}
const reasonixToolPath = reasonixRuntime.binaryRelativePath.slice('resources/'.length).replace(/\\/g, '/').replace(/\/reasonix\.exe$/, '')
if (registry.schemaVersion === 2) {
  for (const source of ['CMakeLists.txt', 'CMakePresets.json', 'robotdog.firmware.json', manifest.studentOverlay.source, manifest.studentOverlay.header, manifest.studentOverlay.configInput]) {
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
  { from: join(root, 'resources', 'workspace-templates'), to: 'workspace-templates' },
  { from: join(root, 'resources', 'firmware-baselines'), to: 'firmware-baselines' },
  { from: join(root, 'resources', 'board-profiles'), to: 'board-profiles' },
  { from: join(root, 'resources', reasonixToolPath), to: reasonixToolPath },
  { from: join(root, 'vendor', 'wch'), to: 'toolchains/wch' },
  { from: packagedGitRoot, to: 'toolchains/git' },
  {
    from: externalFirmware,
    to: baselineTarget,
    filter: [
      'CMakeLists.txt',
      'CMakePresets.json',
      'robotdog.firmware.json',
      'README.md',
      'Core/**/*',
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
    appId: 'cn.robotdog.studio',
    electronVersion: '42.4.1',
    productName: formal ? 'RobotDog Studio' : 'RobotDog Studio 临时测试版',
    copyright: 'Copyright © 2026 RobotDog Studio contributors',
    asar: true,
    npmRebuild: false,
    compression: 'normal',
    directories: { output: join(root, 'release') },
    files: ['out/**/*', 'config/**/*', 'package.json'],
    extraResources,
    win: { executableName: formal ? 'RobotDogStudio' : 'RobotDogStudio-Test' },
    artifactName: formal ? 'RobotDog-Studio-${version}-Windows-${arch}.${ext}' : 'RobotDog-Studio-${version}-PROVISIONAL-Windows-${arch}.${ext}',
    publish: null
  }
})
console.log('Windows package artifacts:')
for (const artifact of artifacts) console.log(`- ${artifact}`)
const packagedResourcesRoot = join(root, 'release', 'win-unpacked', 'resources')
await verifyPackagedFirmwareSource(join(packagedResourcesRoot, baselineTarget))
await verifyPackagedWorkspaceTemplate(resolvePackagedResource(packagedResourcesRoot, registry.studentTemplate ?? 'resources/workspace-templates/ch32v203-robotdog/2026.06'))

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

async function verifyPackagedWorkspaceTemplate(templateRoot) {
  const required = [
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
