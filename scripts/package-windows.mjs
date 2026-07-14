import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Arch, build, Platform } from 'electron-builder'

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
  { from: externalFirmware, to: baselineTarget, filter: ['Core/**/*', 'Debug/**/*', 'Peripheral/**/*', 'Startup/**/*', 'User/**/*', 'Ld/**/*'] }
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
