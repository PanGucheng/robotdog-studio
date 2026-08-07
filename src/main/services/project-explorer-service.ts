import { createHash } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { ProjectExplorerFile, ProjectExplorerLanguage, ProjectExplorerNode, ProjectExplorerOrigin, ProjectExplorerRole, ProjectExplorerSnapshot, StudentCodeFile } from '../../shared/types'
import { CandidateService } from './candidate-service'
import { FirmwareBaselineService } from './firmware-baseline-service'
import { WorkspaceService } from './workspace-service'

const ROOT_DIRECTORIES = new Set(['Core', 'Debug', 'Ld', 'Peripheral', 'Startup', 'User', 'cmake', 'student-config'])
const ROOT_FILES = new Set(['CMakeLists.txt', 'CMakePresets.json', 'robotdog.firmware.json', 'README.md'])
const HIDDEN_NAMES = new Set(['.git', '.github', '.vscode', '.eide', '.mrs', 'node_modules', 'build', 'out', 'release'])
const MAX_FILE_BYTES = 256 * 1024

interface FileDescriptor {
  path: string
  origin: ProjectExplorerOrigin
  role: ProjectExplorerRole
  editable: boolean
  language: ProjectExplorerLanguage
  content?: string
}

export class ProjectExplorerService {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly candidates: CandidateService,
    private readonly baseline: FirmwareBaselineService
  ) {}

  async getSnapshot(workspaceId: string, candidateId?: string): Promise<ProjectExplorerSnapshot> {
    const context = await this.buildContext(workspaceId, candidateId)
    return {
      workspaceId,
      candidateId,
      rootLabel: `RobotDog Firmware · ${context.workspace.baselineCommit.slice(0, 7)}`,
      baselineId: context.workspace.firmwareBaselineId,
      baselineCommit: context.workspace.baselineCommit,
      baselineAvailable: context.baselineAvailable,
      warning: context.warning,
      nodes: buildNodes(context.files, context.modifiedPaths)
    }
  }

  async readFile(workspaceId: string, nodeId: string, candidateId?: string): Promise<ProjectExplorerFile> {
    if (!/^[a-f0-9]{24}$/.test(nodeId)) throw new Error('PROJECT_EXPLORER_NODE_INVALID')
    const context = await this.buildContext(workspaceId, candidateId)
    const nodes = buildNodes(context.files, context.modifiedPaths)
    const node = nodes.find((item) => item.id === nodeId)
    if (!node || node.kind !== 'file') throw new Error('PROJECT_EXPLORER_FILE_NOT_FOUND')
    const descriptor = context.files.get(node.displayPath)
    if (!descriptor) throw new Error('PROJECT_EXPLORER_FILE_NOT_FOUND')
    if (descriptor.content !== undefined) return { node, content: descriptor.content }
    if (!context.baselineRoot) throw new Error('PROJECT_EXPLORER_BASELINE_UNAVAILABLE')
    const target = resolveInside(context.baselineRoot, descriptor.path)
    const info = await lstat(target)
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES) throw new Error('PROJECT_EXPLORER_FILE_UNAVAILABLE')
    return { node, content: await readFile(target, 'utf8') }
  }

  private async buildContext(workspaceId: string, candidateId?: string): Promise<{
    workspace: Awaited<ReturnType<WorkspaceService['get']>>
    files: Map<string, FileDescriptor>
    modifiedPaths: Set<string>
    baselineRoot?: string
    baselineAvailable: boolean
    warning?: string
  }> {
    const workspace = await this.workspaces.get(workspaceId)
    if (workspace.learningPath !== 'mcu-foundations') throw new Error('PROJECT_EXPLORER_MCU_REQUIRED')
    const overlay = await this.candidates.listStudentCodeFiles(workspaceId, candidateId)
    const modifiedPaths = new Set<string>()
    if (candidateId) {
      const candidate = await this.candidates.get(candidateId)
      if (candidate.workspaceId !== workspaceId) throw new Error('CANDIDATE_WORKSPACE_MISMATCH')
      for (const file of candidate.validation?.files ?? []) modifiedPaths.add(file.path)
    }
    const files = new Map<string, FileDescriptor>()
    let baselineRoot: string | undefined
    let baselineAvailable = false
    let warning: string | undefined
    try {
      const status = await this.baseline.getStatus()
      if (status.id !== workspace.firmwareBaselineId || status.expectedCommit !== workspace.baselineCommit) {
        warning = '工作区绑定的固件基线与当前基线不一致，只显示课程覆盖文件。'
      } else if (!status.readyForTesting) {
        warning = '固件基线当前不可用，只显示课程覆盖文件。'
      } else {
        baselineRoot = status.sourceRoot
        baselineAvailable = true
        await this.scanBaseline(baselineRoot, files)
      }
    } catch {
      warning = '固件基线读取失败，只显示课程覆盖文件。'
    }
    for (const file of overlay) files.set(file.path, fromStudentFile(file))
    return { workspace, files, modifiedPaths, baselineRoot, baselineAvailable, warning }
  }

  private async scanBaseline(root: string, files: Map<string, FileDescriptor>): Promise<void> {
    for (const name of [...ROOT_FILES].sort()) {
      const path = resolve(root, name)
      const info = await lstat(path).catch(() => undefined)
      if (info?.isFile() && !info.isSymbolicLink() && info.size <= MAX_FILE_BYTES) {
        const language = languageFor(name)
        if (language) files.set(name, descriptorFor(name, language))
      }
    }
    for (const directory of [...ROOT_DIRECTORIES].sort()) await this.scanDirectory(root, directory, files)
  }

  private async scanDirectory(root: string, relativeDirectory: string, files: Map<string, FileDescriptor>): Promise<void> {
    const directory = resolveInside(root, relativeDirectory)
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))) {
      if (HIDDEN_NAMES.has(entry.name) || entry.isSymbolicLink()) continue
      const path = `${relativeDirectory}/${entry.name}`
      if (entry.isDirectory()) await this.scanDirectory(root, path, files)
      else if (entry.isFile()) {
        const language = languageFor(entry.name)
        if (!language) continue
        const info = await lstat(resolveInside(root, path)).catch(() => undefined)
        if (info?.isFile() && !info.isSymbolicLink() && info.size <= MAX_FILE_BYTES) files.set(path, descriptorFor(path, language))
      }
    }
  }
}

function fromStudentFile(file: StudentCodeFile): FileDescriptor {
  return {
    path: file.path,
    origin: 'lesson-overlay',
    role: file.path.startsWith('App/') ? 'student-code' : file.path.startsWith('Core/') ? 'course-adapter' : roleFor(file.path),
    editable: file.editable,
    language: file.language === 'markdown' ? 'markdown' : file.language,
    content: file.content
  }
}

function descriptorFor(path: string, language: ProjectExplorerLanguage): FileDescriptor {
  return { path, origin: 'firmware-baseline', role: roleFor(path), editable: false, language }
}

function roleFor(path: string): ProjectExplorerRole {
  const root = path.split('/')[0]
  if (root === 'App') return 'student-code'
  if (root === 'User') return 'application'
  if (root === 'Core') return 'core'
  if (root === 'Peripheral') return 'peripheral'
  if (root === 'Startup') return 'startup'
  if (root === 'Ld') return 'linker'
  if (root === 'student-config') return 'config'
  if (root === 'cmake' || root === 'Debug' || /^(?:CMakeLists\.txt|CMakePresets\.json|robotdog\.firmware\.json)$/.test(path)) return 'build'
  return 'documentation'
}

function languageFor(name: string): ProjectExplorerLanguage | undefined {
  if (name === 'CMakeLists.txt' || name.endsWith('.cmake')) return 'cmake'
  const extension = extname(name).toLowerCase()
  if (extension === '.c' || extension === '.h') return 'c'
  if (extension === '.cpp' || extension === '.hpp') return 'cpp'
  if (extension === '.s') return 'asm'
  if (extension === '.ld') return 'linker'
  if (extension === '.json') return 'json'
  if (extension === '.yaml' || extension === '.yml') return 'yaml'
  if (extension === '.md') return 'markdown'
  if (extension === '.txt' || extension === '.cfg') return 'text'
  return undefined
}

function buildNodes(files: Map<string, FileDescriptor>, modifiedPaths: Set<string>): ProjectExplorerNode[] {
  const nodes = new Map<string, ProjectExplorerNode>()
  for (const descriptor of files.values()) {
    const parts = descriptor.path.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      const path = parts.slice(0, index).join('/')
      if (nodes.has(path)) continue
      const childDescriptors = [...files.values()].filter((item) => item.path.startsWith(`${path}/`))
      const overlayOnly = childDescriptors.length > 0 && childDescriptors.every((item) => item.origin === 'lesson-overlay')
      nodes.set(path, {
        id: nodeId('directory', path), parentId: index > 1 ? nodeId('directory', parts.slice(0, index - 1).join('/')) : undefined,
        name: parts[index - 1], kind: 'directory', origin: overlayOnly ? 'lesson-overlay' : 'firmware-baseline',
        role: roleFor(path), access: childDescriptors.some((item) => item.editable) ? 'editable' : 'read-only', state: 'normal', displayPath: path
      })
    }
    const parentPath = parts.slice(0, -1).join('/')
    nodes.set(descriptor.path, {
      id: nodeId('file', descriptor.path), parentId: parentPath ? nodeId('directory', parentPath) : undefined,
      name: parts.at(-1)!, kind: 'file', language: descriptor.language, origin: descriptor.origin,
      role: descriptor.role, access: descriptor.editable ? 'editable' : 'read-only',
      state: modifiedPaths.has(descriptor.path) ? 'modified' : 'normal', displayPath: descriptor.path
    })
  }
  return [...nodes.values()].sort((left, right) => {
    if (left.parentId !== right.parentId) return (left.parentId ?? '').localeCompare(right.parentId ?? '')
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

function nodeId(kind: ProjectExplorerNode['kind'], path: string): string {
  return createHash('sha256').update(`${kind}:${path}`).digest('hex').slice(0, 24)
}

function resolveInside(root: string, child: string): string {
  if (!child || isAbsolute(child) || child.includes('\\') || child.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('PROJECT_EXPLORER_PATH_INVALID')
  const candidate = resolve(root, ...child.split('/'))
  const fromRoot = relative(resolve(root), candidate)
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error('PROJECT_EXPLORER_PATH_INVALID')
  return candidate
}
