import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Operates only on the smoke test's hidden Electron window, never desktop input.
export async function verifyStudioVisuals(window, outputDir, beforeCssPath) {
  if (window.isVisible()) throw new Error('VISUAL_SMOKE_REQUIRES_HIDDEN_WINDOW')
  window.webContents.setBackgroundThrottling(false)
  await mkdir(outputDir, { recursive: true })
  const js = async expression => {
    try { return await window.webContents.executeJavaScript(expression) }
    catch (error) { throw new Error(`VISUAL_SCRIPT_FAILED: ${expression}: ${String(error)}`) }
  }
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
  const wait = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await js(expression)) return; await pause(100) }
    throw new Error(`VISUAL_SMOKE_TIMEOUT: ${expression}`)
  }
  const click = selector => js(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw new Error('VISUAL_CONTROL_MISSING'); node.click(); })()`)
  const size = async (width, height, scale = 1.25) => {
    window.setContentSize(width, height)
    await js(`document.documentElement.style.setProperty('--ui-scale', '${scale}'); document.documentElement.dataset.uiScale = '${scale * 100}'`)
    await pause(200)
  }
  const screenshots = []
  const capture = async name => {
    await js('document.fonts.ready')
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await pause(400)
    const capture = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
    await writeFile(join(outputDir, name + '.png'), capture.toPNG())
    screenshots.push({ name, size: capture.getSize() })
  }
  const checks = []
  const bounds = async selectors => {
    const state = await js(`(() => ({ width: innerWidth, height: innerHeight, nodes: ${JSON.stringify(selectors)}.map(selector => {
      const node = document.querySelector(selector); if (!node) throw new Error('VISUAL_NODE_MISSING: ' + selector);
      const r = node.getBoundingClientRect(); return {selector, x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom};
    }) }))()`)
    for (const node of state.nodes) {
      const scrolls = node.selector.startsWith('.course-center-')
      if (node.x < -2 || node.right > state.width + 2 || (!scrolls && (node.y < -2 || node.bottom > state.height + 2)) || node.width < 1 || node.height < 1) throw new Error('VISUAL_LAYOUT_OVERFLOW: ' + JSON.stringify(state))
    }
    checks.push(state)
  }
  const edition = await js('window.robotDog.getEditionProfile()')
  await size(1440, 900)
  if (edition.id !== 'fun-line-following') {
    await js("localStorage.setItem('robotdog.mcu-project-tour-seen', '1')")
    await wait("Boolean(document.querySelector('.mcu-home'))")
    await capture('after-home')
    await click('.mcu-path-choices > button:not(.is-free)')
    await wait("Boolean(document.querySelector('.course-start-button'))")
    if (beforeCssPath) {
      const css = await readFile(beforeCssPath, 'utf8')
      const variables = [...css.matchAll(/--(navy|navy-soft|canvas|panel|sensor-ink|line|muted):\s*([^;]+);/g)].map(match => `--${match[1]}:${match[2]}!important;`).join('')
      const priorityCss = css.replace(/([a-z-]+)\s*:\s*([^;{}]+);/g, (match, name, value) => `${name}:${value.replace(/\s*!important\s*$/, '')}!important;`)
      const key = await window.webContents.insertCSS(priorityCss + `\n.window-titlebar{display:none!important} :root{${variables}--window-chrome-height:0px!important;--ui-scale:1.25!important}`)
      try { await capture('before-course') } finally { await window.webContents.removeInsertedCSS(key) }
      await wait("getComputedStyle(document.querySelector('.window-titlebar')).display !== 'none'")
    }
    await capture('after-course')
    for (const [width, height, scale] of [[1440,900,1],[1440,900,1.25],[1707,983,1.5],[1080,700,1],[1080,700,1.5],[1080,700,1.75]]) {
      await size(width, height, scale)
      await bounds(['.window-titlebar', '.topbar', '.course-center-hero', '.course-center-layout'])
    }
    await capture('after-course-narrow')
    await size(1440,900)
    if (edition.id === 'mcu-foundations') {
      await click('.course-rail-track > button:nth-child(2)')
      await pause(300)
      await click('.course-start-button')
      await wait("Boolean(document.querySelector('.studio-dialog[open]'))")
      await capture('after-prerequisite-dialog')
      await bounds(['.studio-dialog', '.studio-dialog-actions'])
      const focused = await js("document.activeElement?.textContent")
      if (focused !== '返回课程') throw new Error('VISUAL_DIALOG_INITIAL_FOCUS')
      await js("document.querySelector('.course-start-button').focus()")
      if (await js("document.activeElement?.textContent") !== '返回课程') throw new Error('VISUAL_DIALOG_BACKGROUND_NOT_INERT')
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await wait("!document.querySelector('.studio-dialog[open]')")
      if (!await js("Boolean(document.querySelector('.course-center'))")) throw new Error('VISUAL_DIALOG_CANCEL_NAVIGATED')
      await click('.course-rail-track > button:first-child')
      await pause(300)
    }
    await click('.course-start-button')
    await wait("Boolean(document.querySelector('.lesson-learn-page'))")
    await capture('after-reader')
    await bounds(['.topbar', '.lesson-learn-page', '.lesson-learn-header'])
    await click('.lesson-to-lab-actions .button-primary')
    const filename = edition.id === 'mcu-foundations' ? 'experiment.c' : 'main.c'
    if (edition.id === 'ti-mspm0-foundations') {
      await wait("Boolean(document.querySelector('.student-code-studio [role=treeitem][title=src]'))")
      if (await js("document.querySelector('.student-code-studio [role=treeitem][title=src]').getAttribute('aria-expanded') === 'false'")) await click('.student-code-studio [role=treeitem][title=src]')
    }
    await wait(`([...document.querySelectorAll('.student-code-studio [role=treeitem]')]).some(node => node.textContent.trim() === ${JSON.stringify(filename)})`)
    if (await js("Boolean(document.querySelector('.mcu-project-tour'))")) await click('.mcu-project-tour button:not(.button-primary)')
    await js(`(() => { const file = [...document.querySelectorAll('.student-code-studio [role=treeitem]')].find(node => node.textContent.trim() === ${JSON.stringify(edition.id === 'mcu-foundations' ? 'experiment.c' : 'main.c')}); if (!file) throw new Error('VISUAL_LESSON_FILE_MISSING'); file.click(); })()`)
    await wait("Boolean(document.querySelector('.student-code-studio .monaco-editor'))")
    await wait("Boolean(document.querySelector('.student-code-studio .monaco-editor .view-lines .view-line'))")
    await wait(`Boolean(document.querySelector('.student-editor-toolbar h2')?.textContent.includes(${JSON.stringify(filename)}))`)
    window.setContentSize(1441, 900)
    await pause(200)
    window.setContentSize(1440, 900)
    await pause(600)
    await capture('after-workbench')
    await bounds(['.topbar', '.student-code-studio'])
  } else {
    if (await js("Boolean(document.querySelector('.learning-close'))")) await click('.learning-close')
    const previousWorkspace = await js("document.querySelector('.topbar-project-select')?.value")
    await click('.topbar-action-button')
    await wait(`Boolean(document.querySelector('.topbar-project-select')) && document.querySelector('.topbar-project-select').value !== ${JSON.stringify(previousWorkspace ?? '')}`)
    await capture('after-fun-workbench')
    await bounds(['.window-titlebar', '.topbar', '.studio-shell'])
    if (!await js("Boolean(document.querySelector('.topbar-project-select'))")) {
      await click('.topbar-action-button')
      await wait("Boolean(document.querySelector('.topbar-project-select'))")
    }
    const found = await js(`(() => { const select = document.querySelector('.topbar-project-select'); if (!select?.options.length) return false; select.value=select.options[0].value; select.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`)
    if (found) {
      await wait("Boolean(document.querySelector('.topbar-icon-button'))")
      await click('.topbar-icon-button')
      await wait("Boolean(document.querySelector('.studio-dialog[open] input'))")
      await capture('after-rename-dialog')
      await bounds(['.studio-dialog', '.studio-dialog-actions'])
      if (!await js("document.activeElement === document.querySelector('.studio-dialog input')")) throw new Error('VISUAL_RENAME_INPUT_FOCUS')
      await click('.studio-dialog-close')
    }
  }
  await click('.menu-button')
  await js(`(() => { const button = [...document.querySelectorAll('.project-menu-item')].find(node => node.textContent.includes('关于')); if (!button) throw new Error('VISUAL_ABOUT_MISSING'); button.click(); })()`)
  await wait("Boolean(document.querySelector('.about-dialog'))")
  await capture('after-about')
  if (window.isVisible()) throw new Error('VISUAL_SMOKE_WINDOW_BECAME_VISIBLE')
  await writeFile(join(outputDir, 'verification.json'), JSON.stringify({ edition: edition.id, capture: 'hidden Electron webContents.capturePage, lossless PNG; native caption buttons excluded', screenshots, checks }, null, 2) + '\n')
  console.log('ROBOTDOG_VISUAL_OK ' + JSON.stringify({ edition: edition.id, screenshots: screenshots.length, layoutChecks: checks.length }))
}
