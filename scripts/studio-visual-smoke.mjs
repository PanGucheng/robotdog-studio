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
  const wait = async (expression, attempts = 100) => {
    for (let attempt = 0; attempt < attempts; attempt++) { if (await js(expression)) return; await pause(100) }
    throw new Error(`VISUAL_SMOKE_TIMEOUT: ${expression}`)
  }
  const click = selector => js(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw new Error('VISUAL_CONTROL_MISSING'); const r = node.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(node).visibility === 'hidden') throw new Error('VISUAL_CONTROL_HIDDEN: ' + ${JSON.stringify(selector)}); node.click(); })()`)
  const pointerClick = async selector => {
    const point = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)}; })()`)
    window.webContents.sendInputEvent({ type:'mouseMove', ...point })
    window.webContents.sendInputEvent({ type:'mouseDown', button:'left', clickCount:1, ...point })
    window.webContents.sendInputEvent({ type:'mouseUp', button:'left', clickCount:1, ...point })
  }
  const size = async (width, height, scale = 1.25) => {
    window.setContentSize(width, height)
    // Use the same setting students use, so React state, persisted scale and CSS
    // all agree. This is application scaling, independent of Windows DPI.
    const current = await js("Number(document.documentElement.dataset.uiScale)")
    if (current !== scale * 100) {
      const alreadyOpen = await js("Boolean(document.querySelector('.settings-dialog'))")
      if (!alreadyOpen) {
        await wait("Boolean(document.querySelector('.menu-button'))")
        await click('.menu-button')
        await js("[...document.querySelectorAll('.project-menu-item')].find(node => node.textContent.trim() === '设置').click()")
        await wait("Boolean(document.querySelector('.settings-dialog'))")
      }
      const activeIndex = await js("[...document.querySelectorAll('.settings-nav-item')].findIndex(node => node.classList.contains('active'))")
      await click('.settings-nav-item:first-child')
      await js(`[...document.querySelectorAll('.scale-btn')].find(node => node.textContent.includes('${scale * 100}%')).click()`)
      await wait(`Number(document.documentElement.dataset.uiScale) === ${scale * 100}`)
      if (alreadyOpen) {
        await click('.settings-nav-item:nth-child(' + (activeIndex+1) + ')')
        await wait(`[...document.querySelectorAll('.settings-nav-item')].findIndex(node => node.classList.contains('active')) === ${activeIndex}`)
      } else {
        await click('.settings-dialog-close')
        await wait("!document.querySelector('.settings-dialog')")
      }
    }
    await pause(200)
  }
  const screenshots = []
  const surfaceChecks = []
  const surfaceRoles = {
    'surface-page': ['.mcu-home', '.mcu-free-home', '.course-center', '.mcu-catalog-shell', '.workbench', '.wch-flasher-workbench', '.diff-review'],
    'surface-navigation': ['.window-titlebar', '.topbar', '.settings-dialog-header', '.settings-sidebar', '.learning-body nav', '.diff-files'],
    'surface-content': ['.course-lesson-rail', '.lesson-toc', '.student-file-rail', '.editor-rail-heading', '.editor-safety-note', '.course-center-hero', '.course-lesson-detail', '.lesson-learn-header', '.lesson-reading-surface', '.student-editor-toolbar', '.mcu-bottom-panel', '.mcu-panel-bar', '.mcu-terminal-view', '.mcu-terminal-toolbar', '.mcu-output-view', '.mcu-terminal-view .mcu-build-panel', '.mcu-guide-pane', '.mcu-lab-sticky', '.mcu-lab-step-body', '.mcu-completion-method', '.mcu-lecture-view', '.lecture-toolbar', '.mcu-ai-window', '.mcu-ai-window > header', '.chat-panel', '.chat-welcome', '.runtime-card', '.mcu-lecture-chat', '.lesson-history-drawer', '.settings-dialog', '.settings-content', '.studio-dialog', '.studio-dialog-heading', '.studio-dialog-body', '.studio-dialog-actions', '.studio-dialog input', '.about-dialog', '.about-card', '.learning-center', '.learning-header', '.learning-progress', '.learning-task', '.workbench-tabs', '.wch-hero', '.wch-card', '.wch-log', '.firmware-card', '.mcu-diff-surface', '.mcu-diff-surface > header'],
    'surface-selected': ['.course-rail-track button.active', '.lesson-toc button.active', '.explorer-tree-entry > button.active', '.student-file-group button.active', '.settings-nav-item.active', '.scale-btn.active', '.learning-body nav button.active', '.diff-files button.active']
  }
  const inspectSurfaces = async (scene, settleAttempt = 0) => {
    const result = await js(`(() => {
      const root = getComputedStyle(document.documentElement);
      const effective = node => {
        while (node) { const color = getComputedStyle(node).backgroundColor; if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color; node = node.parentElement; }
        return 'rgb(255, 255, 255)';
      };
      const normalized = value => { const probe = document.createElement('span'); probe.style.color = value; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; };
      const nodes = [];
      for (const [role, selectors] of Object.entries(${JSON.stringify(surfaceRoles)})) {
        const expected = normalized(root.getPropertyValue('--' + role));
        for (const selector of selectors) for (const node of document.querySelectorAll(selector)) {
          const r = node.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(node).visibility === 'hidden') continue;
          nodes.push({selector, role, expected, actual:effective(node)});
        }
      }
      const luminance = color => {
        const channels = color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v => { v /= 255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; });
        return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
      };
      const readable = ['.lesson-toc button', '.lesson-toc button.is-subsection', '.student-editor-toolbar p', '.student-file-group button small', '.student-file-group > span', '.workbench-tabs button', '.editor-safety-note', '.course-rail-heading small', '.lesson-rail-copy small', '.mcu-lab-step-summary small', '.mcu-step-evidence p', '.mcu-panel-summary', '.mcu-problem-main small', '.mcu-terminal-toolbar', '.mcu-output-view', '.settings-section-desc', '.settings-subtext', '.chat-welcome p', '.runtime-card small'];
      const contrast = [];
      for (const selector of readable) for (const node of document.querySelectorAll(selector)) {
        const r = node.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(node).visibility === 'hidden') continue;
        const fg = getComputedStyle(node).color, bg = effective(node), a = luminance(fg), b = luminance(bg);
        contrast.push({selector, fg, bg, ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
      }
      const brand = document.querySelector('.brand-block').getBoundingClientRect();
      const center = document.querySelector('.topbar-center').getBoundingClientRect();
      const crumbs = [...document.querySelectorAll('.breadcrumb-text')].map(node => { const r=node.getBoundingClientRect(); return {x:r.x,right:r.right,width:r.width}; }).filter(r => r.width > 0);
      return {scene:${JSON.stringify(scene)}, scale:root.getPropertyValue('--ui-scale'), width:innerWidth, height:innerHeight, dpr:devicePixelRatio, nodes, contrast, navigation:{brandRight:brand.right, centerLeft:center.left, centerWidth:center.width, crumbs}};
    })()`)
    // Hidden renderers may start CSS transitions only when style is first read.
    // Re-read after their 120–150 ms duration; persistent mismatches still fail.
    const mismatch = result.nodes.find(node => node.actual !== node.expected)
    if (mismatch) {
      if (settleAttempt < 5) { await pause(150); return inspectSurfaces(scene, settleAttempt+1) }
      throw new Error('VISUAL_SURFACE_ROLE_MISMATCH: ' + JSON.stringify({scene, ...mismatch}))
    }
    for (const node of result.contrast) if (node.ratio < 4.5) throw new Error('VISUAL_TEXT_CONTRAST: ' + JSON.stringify({scene, ...node}))
    if (result.navigation.centerWidth > 0 && result.navigation.brandRight > result.navigation.centerLeft + 1) throw new Error('VISUAL_NAVIGATION_OVERLAP: ' + JSON.stringify({scene, ...result.navigation}))
    for (let index=1; index<result.navigation.crumbs.length; index++) if (result.navigation.crumbs[index-1].right > result.navigation.crumbs[index].x + 1) throw new Error('VISUAL_BREADCRUMB_OVERLAP: ' + JSON.stringify({scene, ...result.navigation}))
    surfaceChecks.push(result)
  }
  const capture = async name => {
    await js('document.fonts.ready')
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    await pause(400)
    if (!name.startsWith('before-')) await inspectSurfaces(name)
    if (await js("Boolean(document.querySelector('.settings-dialog'))")) await bounds(['.settings-dialog', '.settings-dialog-header', '.settings-dialog-close'])
    if (await js("Boolean(document.querySelector('.learning-center'))")) await bounds(['.learning-center', '.learning-header', '.learning-close'])
    if (await js("Boolean(document.querySelector('.mcu-ai-window'))")) {
      await bounds(['.mcu-ai-window', '.mcu-ai-window > header', '.mcu-ai-window .prompt-box'])
      const height = await js("document.querySelector('.mcu-ai-window .conversation').getBoundingClientRect().height")
      if (height < 40) throw new Error('VISUAL_ASSISTANT_CONVERSATION_TOO_SHORT: ' + JSON.stringify({scene:name, height}))
    }
    // Flush the hidden compositor after DOM/style checks, so the saved pixels
    // show this scene rather than the preceding settings/transition frame.
    window.webContents.invalidate()
    await window.webContents.capturePage(undefined, { stayHidden:true, stayAwake:true })
    await pause(200)
    window.webContents.invalidate()
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    const capture = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
    await writeFile(join(outputDir, name + '.png'), capture.toPNG())
    screenshots.push({ name, size: capture.getSize(), viewport:window.getContentSize(), scale:await js("getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')") })
  }
  const checks = []
  const interactionChecks = []
  const verifyNavigationInteraction = async selector => {
    const point = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`)
    window.webContents.sendInputEvent({type:'mouseMove', ...point})
    await pause(200)
    const hovered = await js(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); return {hover:node.matches(':hover'), background:getComputedStyle(node).backgroundColor}; })()`)
    if (!hovered.hover || hovered.background !== await js("(() => { const p=document.createElement('i'); p.style.background='var(--surface-hover)'; document.body.append(p); const c=getComputedStyle(p).backgroundColor; p.remove(); return c; })()")) throw new Error('VISUAL_NAVIGATION_HOVER: ' + JSON.stringify(hovered))
    window.webContents.sendInputEvent({type:'mouseMove', x:1, y:1})
    // Focus only the hidden renderer, never the native BrowserWindow.
    window.webContents.focus()
    await js(`document.querySelector(${JSON.stringify(selector)}).previousElementSibling.focus()`)
    window.webContents.sendInputEvent({type:'keyDown', keyCode:'Tab'})
    window.webContents.sendInputEvent({type:'keyUp', keyCode:'Tab'})
    await pause(200)
    const focused = await js(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); const style = getComputedStyle(node); return {focused:document.activeElement === node, visible:node.matches(':focus-visible'), outline:style.outlineStyle, width:style.outlineWidth}; })()`)
    if (!focused.focused || !focused.visible || focused.outline !== 'solid' || parseFloat(focused.width) < 2) throw new Error('VISUAL_NAVIGATION_FOCUS: ' + JSON.stringify(focused))
    interactionChecks.push({selector, hovered, focused})
  }
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
  const themeChecks = []
  const skippedScenes = []
  const requestedTheme = process.env.ROBOTDOG_VISUAL_THEME === 'dark' ? 'dark' : 'light'
  if (await js("Boolean(document.querySelector('.learning-close'))")) await click('.learning-close')
  // Exercise the menu in both directions, persist through the allowlisted bridge,
  // and reload the renderer to verify startup restoration with existing storage.
  await click('.menu-button')
  for (const mode of ['dark', 'light', requestedTheme]) {
    if (await js("document.documentElement.dataset.theme") !== mode) await click('.project-menu-theme')
    await wait('document.documentElement.dataset.theme === ' + JSON.stringify(mode))
    await js('window.studioWindowChrome.setTheme(' + JSON.stringify(mode) + ')')
    const checked = await js("document.querySelector('.project-menu-theme').getAttribute('aria-checked')")
    if (checked !== String(mode === 'dark')) throw new Error('VISUAL_THEME_MENU_STATE')
    const nativeBackground = window.getBackgroundColor()
    const expectedNative = await js("getComputedStyle(document.documentElement).getPropertyValue('--surface-page').trim()")
    if (nativeBackground.toLowerCase() !== expectedNative.toLowerCase()) throw new Error('VISUAL_NATIVE_THEME_SWITCH')
    themeChecks.push({mode, checked, nativeBackground})
  }
  await capture('after-theme-menu')
  await click('.menu-button')
  const invalidRejected = await js("window.studioWindowChrome.setTheme('sepia').then(() => false, () => true)")
  if (!invalidRejected) throw new Error('VISUAL_THEME_INVALID_VALUE_ACCEPTED')
  const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve))
  window.webContents.reload()
  await loaded
  await wait('document.documentElement.dataset.theme === ' + JSON.stringify(requestedTheme))
  const savedTheme = JSON.parse(await readFile(join(process.env.ROBOTDOG_SMOKE_USER_DATA, 'studio-theme.json'), 'utf8')).theme
  if (savedTheme !== requestedTheme) throw new Error('VISUAL_NATIVE_THEME_NOT_SAVED')
  const expectedBackground = await js("getComputedStyle(document.documentElement).getPropertyValue('--surface-page').trim()")
  if (window.getBackgroundColor().toLowerCase() !== expectedBackground.toLowerCase()) throw new Error('VISUAL_NATIVE_THEME_BACKGROUND')
  themeChecks.push({restoredAfterReload:requestedTheme, nativePreference:savedTheme, nativeBackground:window.getBackgroundColor(), invalidRejected})
  await size(1440, 900)

  if (edition.id !== 'fun-line-following') {
    await js("localStorage.setItem('robotdog.mcu-project-tour-seen', '1')")
    await wait("Boolean(document.querySelector('.mcu-home'))")
    await capture('after-home')
    await click('.mcu-path-choices > button.is-free')
    await wait("Boolean(document.querySelector('.mcu-free-home'))")
    await capture('after-free-practice')
    await click('.mcu-free-home .mcu-page-back')
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
    if (edition.id === 'mcu-foundations') {
      await verifyNavigationInteraction('.course-rail-track > button:nth-child(2)')
      await capture('after-navigation-focus')
    }
    for (const [width, height, scale] of [[1440,900,1],[1440,900,1.25],[1707,983,1.5],[1080,700,1],[1080,700,1.5],[1080,700,1.75]]) {
      await size(width, height, scale)
      await bounds(['.window-titlebar', '.topbar', '.course-center-hero', '.course-center-layout'])
      await inspectSurfaces('course-' + width + '-' + scale)
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
    await js("[...document.querySelectorAll('.lesson-header-actions button')].find(node => node.textContent.includes('AI 历史')).click()")
    await wait("Boolean(document.querySelector('.lesson-history-drawer'))")
    await capture('after-lecture-ai-history')
    await click('.lesson-history-drawer header button')
    await size(1080,700,1.75)
    await click('.lesson-toc-toggle')
    await capture('after-reader-narrow-directory')
    await click('.lesson-toc-close')
    await capture('after-reader-narrow')
    await size(1440,900)
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
    await js("window.__visualThemeEditor = document.querySelector('.student-code-studio .monaco-editor')")
    const editorText = await js("document.querySelector('.student-code-studio .monaco-editor .view-lines').textContent")
    await click('.menu-button')
    await click('.project-menu-theme')
    await wait('document.documentElement.dataset.theme !== ' + JSON.stringify(requestedTheme))
    if (!await js("window.__visualThemeEditor === document.querySelector('.student-code-studio .monaco-editor')")) throw new Error('VISUAL_THEME_REMOUNTED_EDITOR')
    if (await js("document.querySelector('.student-code-studio .monaco-editor .view-lines').textContent") !== editorText) throw new Error('VISUAL_THEME_CHANGED_EDITOR_CONTENT')
    await click('.project-menu-theme')
    await wait('document.documentElement.dataset.theme === ' + JSON.stringify(requestedTheme))
    await click('.menu-button')
    themeChecks.push({liveEditorPreserved:true, contentPreserved:true})
    await capture('after-workbench')
    await bounds(['.topbar', '.student-code-studio'])
    await wait("Boolean(document.querySelector('.mcu-reference-open'))")
    await click('.mcu-reference-open')
    await wait("Boolean(document.querySelector('.mcu-lecture-view'))")
    await capture('after-knowledge-reference')
    await click('.mcu-reference-back')
    const statusStyles = await js(`(() => {
      const panel = document.querySelector('.mcu-bottom-panel'), original = panel.className;
      const root = getComputedStyle(document.documentElement), results = [];
      try {
        for (const [state,token] of [['running','amber'],['stale','amber'],['passed','green'],['failed','red']]) {
          panel.className = original.replace(/is-(idle|running|stale|passed|failed)/g,'') + ' is-' + state;
          const probe = document.createElement('span'); probe.style.color=root.getPropertyValue('--'+token); document.body.append(probe);
          const expected = getComputedStyle(probe).color; probe.remove();
          results.push({state, expected, border:getComputedStyle(panel).borderTopColor, surface:getComputedStyle(panel).backgroundColor});
        }
      } finally { panel.className = original; }
      return results;
    })()`)
    for (const status of statusStyles) if (status.border !== status.expected || status.surface !== await js("(() => { const p=document.createElement('i'); p.style.background='var(--surface-content)'; document.body.append(p); const c=getComputedStyle(p).backgroundColor; p.remove(); return c; })()")) throw new Error('VISUAL_STATUS_SURFACE_CHANGED: ' + JSON.stringify(status))
    interactionChecks.push({kind:'constructed CSS status classes, not compiler/hardware results', statusStyles})
    await pointerClick('.mcu-ai-button')
    await wait("Boolean(document.querySelector('.mcu-ai-window'))")
    await capture('after-ai-assistant')
    await click('.mcu-ai-window button[aria-label="收起 AI 助教"]')
    for (const [width,height,scale] of [[1440,900,1],[1440,900,1.25],[1707,983,1.5],[1080,700,1.5],[1080,700,1.75]]) {
      await size(width,height,scale)
      await inspectSurfaces('workbench-' + width + '-' + scale)
      await bounds(['.topbar', '.student-code-studio'])
    }
    await capture('after-workbench-narrow')
    await click('.mcu-explorer-toggle')
    await capture('after-workbench-narrow-files')
    const editorFraction = await js("document.querySelector('.student-editor-main').getBoundingClientRect().width / document.querySelector('.student-code-studio').getBoundingClientRect().width")
    if (editorFraction < .75) throw new Error('VISUAL_FILE_DRAWER_COLLAPSED_EDITOR: ' + editorFraction)
    interactionChecks.push({kind:'narrow file drawer preserves editor width', editorFraction})
    if (edition.id === 'ti-mspm0-foundations') {
      const entryVisible = await js("(() => { const button=document.querySelector('.mcu-sysconfig-button'), r=button.getBoundingClientRect(); return button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })()")
      if (!entryVisible) throw new Error('VISUAL_SYSCONFIG_ENTRY_COVERED')
    }
    await click('.mcu-explorer-toggle')
    if (await js("Boolean(document.querySelector('.mcu-guide-toggle'))")) {
      await click('.mcu-guide-toggle')
      await capture('after-workbench-narrow-tasks')
      await click('.mcu-guide-toggle')
    }
    await size(1440,900)
    await pointerClick('.mcu-ai-button')
    await wait("Boolean(document.querySelector('.mcu-ai-window'))")
    await size(1080,700,1.75)
    await capture('after-ai-assistant-narrow')
    await click('.mcu-ai-window button[aria-label="收起 AI 助教"]')
    await size(1440,900)
  } else {
    if (await js("Boolean(document.querySelector('.learning-close'))")) await click('.learning-close')
    const previousWorkspace = await js("document.querySelector('.topbar-project-select')?.value")
    await click('.topbar-action-button')
    await wait(`Boolean(document.querySelector('.topbar-project-select')) && document.querySelector('.topbar-project-select').value !== ${JSON.stringify(previousWorkspace ?? '')}`)
    await capture('after-fun-workbench')
    await bounds(['.window-titlebar', '.topbar', '.studio-shell'])
    for (const [index,name] of [[0,'parameters'],[2,'serial'],[3,'build'],[4,'wch'],[5,'code'],[6,'review']]) {
      if (name === 'code' && process.env.ROBOTDOG_VISUAL_SKIP_FUN_EDITOR === '1') { skippedScenes.push('fun-code: Monaco loading timed out in the complete run'); continue }
      await click('.workbench-tabs button:nth-child(' + (index+1) + ')')
      if (name === 'code') await wait("Boolean(document.querySelector('.student-code-studio .monaco-editor .view-lines .view-line'))", 400)
      await capture('after-fun-' + name)
    }
    await size(1080,700,1.75)
    await capture('after-fun-narrow')
    await size(1440,900)
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
  await js("[...document.querySelectorAll('.project-menu-item')].find(node => node.textContent.trim() === '设置').click()")
  await wait("Boolean(document.querySelector('.settings-dialog'))")
  await capture('after-settings')
  for (const index of [2,3,4,5]) {
    await click('.settings-nav-item:nth-child(' + index + ')')
    await capture('after-settings-' + index)
  }
  await size(1080,700,1.75)
  await capture('after-settings-narrow')
  await click('.settings-dialog-close')
  await size(1440,900)
  if (edition.id === 'fun-line-following') {
    await click('.menu-button')
    await js("[...document.querySelectorAll('.project-menu-item')].find(node => node.textContent.includes('操作示范')).click()")
    await wait("Boolean(document.querySelector('.learning-center'))")
    await capture('after-learning-center')
    await click('.learning-close')
    await size(1080,700,1.75)
    await click('.menu-button')
    await js("[...document.querySelectorAll('.project-menu-item')].find(node => node.textContent.includes('操作示范')).click()")
    await capture('after-learning-center-narrow')
    await click('.learning-close')
    await size(1440,900)
  }
  await click('.menu-button')
  await js(`(() => { const button = [...document.querySelectorAll('.project-menu-item')].find(node => node.textContent.includes('关于')); if (!button) throw new Error('VISUAL_ABOUT_MISSING'); button.click(); })()`)
  await wait("Boolean(document.querySelector('.about-dialog'))")
  await capture('after-about')
  await bounds(['.about-dialog'])
  await click('.about-dialog .mcu-settings-close')
  await size(1080,700,1.75)
  await click('.menu-button')
  await js("[...document.querySelectorAll('.project-menu-item')].find(node => node.textContent.includes('关于')).click()")
  await wait("Boolean(document.querySelector('.about-dialog'))")
  await capture('after-about-narrow')
  await bounds(['.about-dialog'])
  if (window.isVisible()) throw new Error('VISUAL_SMOKE_WINDOW_BECAME_VISIBLE')
  await writeFile(join(outputDir, 'verification.json'), JSON.stringify({ edition: edition.id, capture: 'hidden Electron webContents.capturePage, lossless PNG; native caption buttons excluded', theme:requestedTheme, themeChecks, skippedScenes, screenshots, checks, surfaceChecks, interactionChecks }, null, 2) + '\n')
  console.log('ROBOTDOG_VISUAL_OK ' + JSON.stringify({ edition: edition.id, screenshots: screenshots.length, layoutChecks: checks.length, surfaceChecks:surfaceChecks.length }))
}
