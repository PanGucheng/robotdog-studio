// Real built renderer + real Monaco, fresh profile, all network requests blocked.
// Uses the existing browser demo API; never opens hardware or student workspaces.
const { join, resolve, sep } = require('node:path')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const result = require('node:child_process').spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
const { app, BrowserWindow, session } = require('electron')
const root = join(__dirname, '..')
const rendererRoot = resolve(process.argv.find(arg => arg.startsWith('--renderer-root='))?.slice('--renderer-root='.length) ?? join(root, 'out/renderer'))
const profile = mkdtempSync(join(tmpdir(), 'robohorse-editor-offline-'))
app.setPath('userData', profile)
app.on('window-all-closed', () => {})
const expectLoading = process.argv.includes('--expect-loading')
let window
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function evaluate(source) { return window.webContents.executeJavaScript(source) }
async function waitFor(expression, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return
    await delay(100)
  }
  throw new Error('Timed out: ' + expression)
}

app.whenReady().then(async () => {
  for (const edition of ['ti-mspm0-foundations', 'mcu-foundations', 'fun-line-following']) {
    const blocked = []
    const errors = []
    const workers = new Map()
    const partition = session.fromPartition('editor-offline-' + edition)
    partition.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      blocked.push(details.url); callback({ cancel: true })
    })
    window = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { session: partition, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    window.webContents.on('console-message', event => { if (event.level === 'error' || event.level === 'warning') errors.push(event.message) })
    window.webContents.debugger.attach('1.3')
    window.webContents.debugger.on('message', (_event, method, params) => {
      if (method === 'Target.attachedToTarget' && params.targetInfo.type === 'worker') workers.set(params.sessionId, params.targetInfo.url)
      if (method === 'Target.detachedFromTarget') workers.delete(params.sessionId)
    })
    await window.webContents.debugger.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
    await window.loadFile(join(rendererRoot, 'index.html'), { query: { edition } })
    await waitFor('Boolean(document.querySelector(".studio-shell"))')
    await evaluate(`localStorage.setItem('robotdog.learning-intro-seen.v1', '1')`)
    await window.loadFile(join(rendererRoot, 'index.html'), { query: { edition } })
    if (edition === 'fun-line-following') {
      await waitFor('Boolean(document.querySelector(".workbench-tabs"))')
      await evaluate(`[...document.querySelectorAll('.workbench-tabs button')].find(button => button.textContent.includes('编写代码')).click()`)
    } else {
      await waitFor('Boolean(document.querySelector(".mcu-path-choices .is-free"))')
      await evaluate(`document.querySelector('.mcu-path-choices .is-free').click()`)
      await waitFor('Boolean(document.querySelector(".mcu-create-free"))')
      await evaluate(`document.querySelector('.mcu-create-free').click()`)
    }
    await waitFor('Boolean(document.querySelector(".student-monaco-shell"))')
    if (expectLoading) {
      await waitFor('document.querySelector(".student-monaco-shell").textContent.includes("Loading...") && [...document.scripts].some(script => /https?:/.test(script.src))')
      if (!blocked.some(url => /monaco|vs\/loader/.test(url))) throw new Error('Expected a blocked editor CDN request')
      console.log('EDITOR_OFFLINE_REPRODUCED ' + JSON.stringify({ edition, blocked }))
    } else {
      await waitFor('Boolean(document.querySelector(".student-monaco-shell .monaco-editor .view-lines")?.textContent.trim())')
      if (edition !== 'fun-line-following') {
        await evaluate(`document.querySelector('.student-monaco-shell .native-edit-context, .student-monaco-shell textarea.inputarea').focus()`)
        await window.webContents.debugger.sendCommand('Input.insertText', { text: '// offline edit check\n' })
        await waitFor(`document.querySelector('.student-monaco-shell .view-lines').textContent.includes('offline')`)
        await waitFor(`[...document.querySelectorAll('.student-editor-actions button')].some(button => button.textContent.trim() === '保存' && !button.disabled)`)
        await evaluate(`[...document.querySelectorAll('.student-editor-actions button')].find(button => button.textContent.trim() === '保存').click()`)
        await waitFor(`document.querySelector('.draft-save-state')?.textContent.includes('已保存')`)
      }
      if (edition === 'ti-mspm0-foundations') {
        await evaluate(`globalThis.offlineTestWorkers = ['editorWorkerService', 'json', 'css', 'html', 'typescript'].map(label => globalThis.MonacoEnvironment.getWorker('', label))`)
        const deadline = Date.now() + 15000
        const loaded = new Set()
        while (Date.now() < deadline && loaded.size < 5) {
          for (const [id, url] of workers) {
            if (!url.startsWith('file:') || !url.includes('.worker-')) continue
            try {
              const result = await window.webContents.debugger.sendCommand('Runtime.evaluate', { expression: 'typeof self.onmessage === "function"', returnByValue: true }, id)
              if (result.result.value) loaded.add(url.split('/').at(-1).split('-')[0])
            } catch { /* Worker execution contexts may still be starting. */ }
          }
          if (loaded.size < 5) await delay(100)
        }
        if (loaded.size !== 5) throw new Error('Local editor/language workers failed to initialize: ' + JSON.stringify([...workers.values()]))
        await evaluate('globalThis.offlineTestWorkers.forEach(worker => worker.terminate()); delete globalThis.offlineTestWorkers')
        console.log('EDITOR_LOCAL_WORKERS_OK ' + JSON.stringify([...loaded]))
      }
      if (blocked.length) throw new Error('Unexpected network dependency: ' + blocked.join(', '))
      const failures = errors.filter(message => /Monaco initialization|Could not create web worker|Failed to construct.*Worker|Unexpected usage/i.test(message))
      if (failures.length) throw new Error(failures.join('\n'))
      console.log('EDITOR_OFFLINE_OK ' + JSON.stringify({ edition, blockedRequests: blocked.length, codeVisible: true, editAndSave: edition !== 'fun-line-following' }))
    }
    window.destroy(); window = undefined
  }
  app.exit(0)
}).catch(async error => {
  console.error(error)
  if (window && !window.isDestroyed()) {
    console.error(await evaluate(`JSON.stringify({ code: document.querySelector('.student-monaco-shell .view-lines')?.textContent, readonly: document.querySelector('.editor-readonly-flag')?.textContent, selected: document.querySelector('.student-editor-toolbar')?.textContent, active: document.activeElement?.outerHTML.slice(0, 250) })`))
  }
  window?.destroy(); app.exit(1)
})

app.on('will-quit', () => {
  const expectedPrefix = resolve(tmpdir()) + sep + 'robohorse-editor-offline-'
  if (!resolve(profile).startsWith(expectedPrefix)) throw new Error('Temporary profile path mismatch')
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch { /* Chromium can briefly retain profile files. */ }
})
