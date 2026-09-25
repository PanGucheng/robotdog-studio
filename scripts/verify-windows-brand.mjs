// Build a small icon-validation installer, not a distributable teaching edition.
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Arch, build, Platform } from 'electron-builder'

const root = resolve(import.meta.dirname, '..')
const parent = join(root, '.tmp', 'brand-validation')
await mkdir(parent, { recursive: true })
const stage = await mkdtemp(join(parent, 'windows-'))
const appDir = join(stage, 'app')
await mkdir(appDir)
const icon = join(root, 'resources', 'brand', 'robohorse.ico')
await writeFile(join(appDir, 'package.json'), JSON.stringify({ name: 'robohorse-brand-check', productName: 'RoboHorse Brand Check', version: '0.1.0', main: 'main.cjs', author: 'RoboHorse Studio', description: 'Icon packaging verification only' }))
await writeFile(join(appDir, 'main.cjs'), `require('electron').app.whenReady().then(() => require('electron').app.quit())`)
const artifacts = await build({
  projectDir: appDir,
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  config: {
    appId: 'cn.robohorse.brand-check', productName: 'RoboHorse Brand Check',
    electronVersion: '42.4.1', electronDist: join(root, 'node_modules/electron/dist'),
    directories: { output: join(stage, 'output') },
    asar: true, npmRebuild: false, compression: 'store', publish: null,
    win: { icon, executableName: 'RoboHorse-Brand-Check', requestedExecutionLevel: 'asInvoker' },
    nsis: { installerIcon: icon, uninstallerIcon: icon, installerHeaderIcon: icon, oneClick: false, perMachine: true, allowToChangeInstallationDirectory: true },
    artifactName: 'RoboHorse-Brand-Check-Setup.exe'
  }
})
const executables = [join(stage, 'output/win-unpacked/RoboHorse-Brand-Check.exe'), ...artifacts.filter(path => path.endsWith('.exe'))]
const report = []
for (const path of executables) {
  const binary = await readFile(path)
  const sizes = []
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    const png = await readFile(join(root, 'resources', 'brand', `robohorse-${size}.png`))
    sizes.push({ size, embeddedPngFound: binary.includes(png) })
  }
  report.push({ path, sizes })
}
await writeFile(join(parent, 'windows-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (report.some(file => file.sizes.some(frame => !frame.embeddedPngFound))) process.exitCode = 1
