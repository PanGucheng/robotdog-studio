import { lstat, mkdir, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

interface SysconfigLaunchOptions {
  sysconfigRoot: string
  productPath: string
  projectFile: string
  launcherRoot: string
}

// Launch the unmodified TI application through a small NW.js entry point.
// Window.open defaults to focus:false; each workspace also needs its own
// profile so NW's single-instance handling cannot reopen a different project.
export async function prepareSysconfigLaunch(options: SysconfigLaunchOptions): Promise<{ executable: string; args: string[] }> {
  const executable = join(options.sysconfigRoot, 'nw', 'nw.exe')
  const vendorEntry = join(options.sysconfigRoot, 'app', 'desktopServer.js')
  for (const file of [executable, vendorEntry, options.projectFile]) {
    if (!(await stat(file).then(item => item.isFile(), () => false))) throw new Error(`SysConfig 启动文件不存在：${file}`)
  }
  const vendor = JSON.parse(await readFile(join(options.sysconfigRoot, 'app', 'package.json'), 'utf8')) as { 'node-remote'?: string }
  const appRoot = join(options.launcherRoot, 'app')
  await mkdir(appRoot, { recursive: true })
  // TI resolves its device database relative to nw.App.startPath/../dist.
  // Keep that layout with a directory junction, without copying or modifying TI.
  const vendorDist = resolve(options.sysconfigRoot, 'dist')
  if (!(await stat(vendorDist)).isDirectory()) throw new Error('SysConfig 缺少 dist 资源目录。')
  const distLink = join(options.launcherRoot, 'dist')
  if (await lstat(distLink).then(() => true, () => false)) {
    if (resolve(await realpath(distLink)).toLowerCase() !== vendorDist.toLowerCase()) throw new Error('SysConfig 启动资源路径不匹配。')
  } else await symlink(vendorDist, distLink, 'junction')
  await writeFile(join(appRoot, 'package.json'), JSON.stringify({
    name: 'RoboHorse Studio SysConfig', main: 'launcher.js',
    ...(vendor['node-remote'] ? { 'node-remote': vendor['node-remote'] } : {})
  }), 'utf8')
  const filterPath = join(appRoot, 'filter-nw-args.js')
  await writeFile(filterPath, 'nw.App.filteredArgv.push(/^--user-data-dir=/);\n', 'utf8')
  await writeFile(join(appRoot, 'launcher.js'), sysconfigBootstrap(vendorEntry, filterPath), 'utf8')
  return { executable, args: [
    `--user-data-dir=${join(options.launcherRoot, 'profile')}`, appRoot,
    '--compiler', 'gcc', '--product', options.productPath, options.projectFile
  ] }
}

export function sysconfigBootstrap(vendorEntry: string, filterPath?: string): string {
  return `'use strict';
const windows = new Set();
nw.App.filteredArgv.push(/^--user-data-dir=/);
const openWindow = nw.Window.open.bind(nw.Window);
function activate(win) {
  win.restore();
  win.show();
  const alreadyOnTop = win.isAlwaysOnTop;
  try {
    if (!alreadyOnTop) win.setAlwaysOnTop(true);
    win.focus();
  } finally {
    if (!alreadyOnTop) win.setAlwaysOnTop(false);
  }
}
nw.Window.open = function(url, options, callback) {
  return openWindow(url, { ...options, focus: true${filterPath ? `, inject_js_start: ${JSON.stringify(filterPath)}` : ''} }, function(win) {
    windows.add(win);
    win.on('closed', () => windows.delete(win));
    activate(win);
    if (callback) callback(win);
  });
};
nw.App.on('open', () => { for (const win of windows) activate(win); });
require(${JSON.stringify(vendorEntry)});
`
}
