import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { ProjectExplorerLanguage, StudentCodeFile } from '../../shared/types'

export const SANDBOX_MAX_FILE_BYTES = 2 * 1024 * 1024
const internalNames = new Set(['.git', '.gitkeep', '.reasonix', '.mrs', '.robotdog-managed', 'robotdog.project.json', 'reasonix.toml', 'agents.md', 'node_modules', 'build', 'out', 'release'])
export function validateSandboxName(name: string): void {
  if (!name || name.length > 255 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[ .]$/.test(name) || name === '.' || name === '..' || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) || !isSandboxProjectPath(name)) throw new Error('名称无效，请使用合法的文件或文件夹名称。')
}
export async function assertSandboxParent(root: string, path: string): Promise<string> {
  if (path && !isSandboxProjectPath(path)) throw new Error('SANDBOX_PATH_INVALID')
  let target = resolve(root)
  const rootInfo = await lstat(target)
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw new Error('父目录不存在或不可用。')
  for (const part of path ? path.split('/') : []) {
    validateSandboxName(part)
    target = join(target, part)
    const info = await lstat(target).catch(() => { throw new Error('父目录不存在或不可用。') })
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('父目录不存在或不可用。')
  }
  const inside = relative(await realpath(root), await realpath(target))
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error('SANDBOX_PATH_INVALID')
  return target
}
export async function listSandboxDirectories(root: string): Promise<string[]> {
  const directories: string[] = []
  async function scan(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (!entry.isDirectory() || entry.isSymbolicLink() || !isSandboxProjectPath(path)) continue
      directories.push(path)
      await scan(join(directory, entry.name), path)
    }
  }
  await scan(root, '')
  return directories
}
export function isSandboxProjectPath(path: string): boolean {
  return Boolean(path) && !path.includes('\\') && !path.includes(':') && path.split('/').every(part => Boolean(part) && part !== '.' && part !== '..' && !internalNames.has(part.toLowerCase()))
}
export async function assertSandboxFile(root: string, path: string): Promise<void> {
  if (!isSandboxProjectPath(path)) throw new Error('SANDBOX_PATH_INVALID')
  let target = resolve(root)
  for (const part of path.split('/')) {
    target = join(target, part)
    if ((await lstat(target)).isSymbolicLink()) throw new Error('SANDBOX_LINK_DENIED')
  }
  const inside = relative(await realpath(root), await realpath(target))
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside) || !(await lstat(target)).isFile()) throw new Error('SANDBOX_PATH_INVALID')
}
export function sandboxLanguage(path: string): ProjectExplorerLanguage {
  if (path.endsWith('CMakeLists.txt') || path.endsWith('.cmake')) return 'cmake'
  return ({ '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp', '.s': 'asm', '.ld': 'linker', '.lds': 'linker', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.md': 'markdown', '.syscfg': 'javascript' } as Record<string, ProjectExplorerLanguage>)[extname(path).toLowerCase()] ?? 'text'
}
export async function listSandboxProjectFiles(root: string): Promise<StudentCodeFile[]> {
  const files: StudentCodeFile[] = []
  async function scan(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (!isSandboxProjectPath(path) || entry.isSymbolicLink()) continue
      const target = join(root, ...path.split('/'))
      if (entry.isDirectory()) await scan(target, path)
      else if (entry.isFile()) {
        const info = await lstat(target)
        if (info.isSymbolicLink() || info.size > SANDBOX_MAX_FILE_BYTES) continue
        const bytes = await readFile(target)
        if (bytes.includes(0)) continue
        const content = bytes.toString('utf8')
        if (!Buffer.from(content, 'utf8').equals(bytes)) continue
        files.push({ path, label: entry.name, group: '工程文件', language: sandboxLanguage(path), editable: true, content })
      }
    }
  }
  await scan(root, '')
  return files.sort((a, b) => a.path.localeCompare(b.path))
}
