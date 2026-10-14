import { runInNewContext } from 'node:vm'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareSysconfigLaunch, sysconfigBootstrap } from './ti-sysconfig-launcher'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('opens the vendor window in front and restores an existing minimized window without reopening the project', () => {
  const win = Object.assign(new EventEmitter(), { show: vi.fn(), focus: vi.fn(), restore: vi.fn(), isAlwaysOnTop: false, setAlwaysOnTop: vi.fn() })
  const app = Object.assign(new EventEmitter(), { filteredArgv: [] as RegExp[] })
  const open = vi.fn((_url, _options, callback) => callback(win))
  const nw = { Window: { open }, App: app }
  const vendorLoad = vi.fn(() => nw.Window.open('http://localhost:3210', { width: 1280 }, () => {}))
  runInNewContext(sysconfigBootstrap('D:\\TI tools\\app\\desktopServer.js'), { nw, require: vendorLoad })
  expect(open.mock.calls[0][1]).toMatchObject({ width: 1280, focus: true })
  expect(win.focus).toHaveBeenCalledTimes(1)
  expect(app.filteredArgv.some(pattern => pattern.test('--user-data-dir=C:\\profile with spaces'))).toBe(true)
  app.emit('open')
  expect(win.restore).toHaveBeenCalledTimes(2)
  win.emit('minimize')
  app.emit('open')
  expect(win.restore).toHaveBeenCalledTimes(3)
  expect(win.focus).toHaveBeenCalledTimes(3)
  expect(win.setAlwaysOnTop.mock.calls).toEqual([[true], [false], [true], [false], [true], [false]])
  expect(vendorLoad).toHaveBeenCalledTimes(1)
  win.emit('closed')
  app.emit('open')
  expect(win.focus).toHaveBeenCalledTimes(3)
})

it('keeps distinct workspace profiles and passes paths with spaces as literal arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sysconfig launch fixture '))
  roots.push(root)
  const sysconfigRoot = join(root, 'TI tools')
  await mkdir(join(sysconfigRoot, 'nw'), { recursive: true })
  await mkdir(join(sysconfigRoot, 'app'), { recursive: true })
  await mkdir(join(sysconfigRoot, 'dist'), { recursive: true })
  await writeFile(join(sysconfigRoot, 'nw/nw.exe'), '')
  await writeFile(join(sysconfigRoot, 'app/desktopServer.js'), '// vendor entry')
  await writeFile(join(sysconfigRoot, 'app/package.json'), JSON.stringify({ 'node-remote': 'http://localhost:*' }))
  const projectFile = join(root, 'gpio blue.syscfg')
  await writeFile(projectFile, '// source')
  const options = { sysconfigRoot, productPath: join(root, 'SDK product.json'), projectFile }
  const first = await prepareSysconfigLaunch({ ...options, launcherRoot: join(root, 'workspace A') })
  const second = await prepareSysconfigLaunch({ ...options, launcherRoot: join(root, 'workspace B') })
  expect(first.args[0]).not.toBe(second.args[0])
  expect(first.args.at(-1)).toBe(projectFile)
  expect(first.args).toContain(options.productPath)
  expect(first.executable).toBe(join(sysconfigRoot, 'nw/nw.exe'))
  expect(JSON.parse(await readFile(join(root, 'workspace A/app/package.json'), 'utf8'))['node-remote']).toBe('http://localhost:*')
  expect(await realpath(join(root, 'workspace A/dist'))).toBe(await realpath(join(sysconfigRoot, 'dist')))
  expect(await readFile(join(sysconfigRoot, 'app/desktopServer.js'), 'utf8')).toBe('// vendor entry')
})
