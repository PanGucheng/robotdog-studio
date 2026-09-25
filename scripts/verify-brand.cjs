// Renderer-only visual check using the built app's existing browser demo API.
// Run after npm run build. Does not connect hardware or touch student data.
const { join } = require('node:path')
const { mkdirSync, writeFileSync, mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = require('node:child_process').spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
const { app, BrowserWindow } = require('electron')
const root = join(__dirname, '..')
const output = join(root, '.tmp', 'brand-validation')
mkdirSync(output, { recursive: true })
app.setPath('userData', mkdtempSync(join(tmpdir(), 'robohorse-brand-')))
const dpr = process.argv.includes('--hidpi') ? 2 : 1
app.commandLine.appendSwitch('force-device-scale-factor', String(dpr))
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1440, height: 900, useContentSize: true, show: false, icon: join(root, 'resources/brand/robohorse.ico'), webPreferences: { backgroundThrottling: false } })
  const results = []
  for (const edition of ['fun-line-following', 'mcu-foundations', 'ti-mspm0-foundations']) {
    for (const scale of [100, 125, 150, 175]) {
      await window.loadFile(join(root, 'out/renderer/index.html'), { query: { edition } })
      await window.webContents.executeJavaScript(`new Promise((resolve, reject) => { const timeout = setTimeout(() => { clearInterval(timer); reject(new Error('UI did not mount')); }, 5000); const timer = setInterval(() => { if (document.documentElement.dataset.uiScale) { clearInterval(timer); clearTimeout(timeout); resolve(); } }, 25) })`)
      await window.webContents.executeJavaScript(`localStorage.setItem('robotdog.ui-scale', '${scale}'); localStorage.setItem('robotdog.learning-intro-seen.v1', '1')`)
      await window.loadFile(join(root, 'out/renderer/index.html'), { query: { edition } })
      await window.webContents.executeJavaScript(`(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); await new Promise(r => setTimeout(r, 400)); })()`)
      const check = await window.webContents.executeJavaScript(`(() => {
        const mark = document.querySelector('.brand-mark'), title = document.querySelector('.brand-block h1'), actions = document.querySelector('.topbar-actions');
        const box = title.getBoundingClientRect(), markBox = mark.getBoundingClientRect(), actionBox = actions.getBoundingClientRect();
        return { scale: document.documentElement.dataset.uiScale, dpr: devicePixelRatio, markLoaded: mark.complete && mark.naturalWidth === 512, markWidth: markBox.width, titleVisible: box.right <= actionBox.left && box.right <= innerWidth && box.left >= markBox.right, topbarFits: actionBox.right <= innerWidth, canvas: getComputedStyle(document.querySelector('.studio-shell')).backgroundColor, titleColor: getComputedStyle(title).color, studioColor: getComputedStyle(title.querySelector('em')).color, brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length };
      })()`)
      const filename = `${edition}-${scale}-${dpr}x.png`
      writeFileSync(join(output, filename), (await window.webContents.capturePage()).toPNG())
      results.push({ edition, expectedScale: String(scale), ...check, screenshot: filename })
    }
  }
  writeFileSync(join(output, `ui-report-${dpr}x.json`), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
  const failed = results.some(result => result.scale !== result.expectedScale || !result.markLoaded || !result.titleVisible || !result.topbarFits || result.brokenImages)
  window.destroy(); app.exit(failed ? 1 : 0)
}).catch(error => { console.error(error); app.exit(1) })
