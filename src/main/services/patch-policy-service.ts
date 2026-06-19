import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { PatchFileSummary, PatchValidationReport, PatchViolation } from '../../shared/types'
import { GitWorkspaceService } from './git-workspace-service'

const policySchema = z.object({
  schemaVersion: z.literal(1),
  policyProfile: z.literal('student-v1'),
  allowedEditGlobs: z.array(z.string().min(1)).min(1).max(64),
  deniedGlobs: z.array(z.string().min(1)).max(128),
  maxChangedFiles: z.number().int().min(1).max(100),
  maxPatchBytes: z.number().int().min(1).max(2 * 1024 * 1024),
  maxSingleFileBytes: z.number().int().min(1).max(1024 * 1024),
  maxAddedLines: z.number().int().min(1).max(20_000)
}).strict()

const alwaysDenied = ['.git/**', '.gitattributes', '.gitignore', 'robotdog.project.json', 'reasonix.toml', 'AGENTS.md', '**/*.exe', '**/*.dll', '**/*.bat', '**/*.cmd', '**/*.ps1']
const secretPattern = /(?:api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i
const absoluteUserPathPattern = /[A-Za-z]:\\Users\\[^\\\r\n]+/i

export class PatchPolicyService {
  constructor(private readonly git = new GitWorkspaceService()) {}

  async validate(candidateRoot: string): Promise<PatchValidationReport> {
    const policy = policySchema.parse(JSON.parse(await readFile(join(candidateRoot, 'robotdog.project.json'), 'utf8')))
    const changes = await this.git.changedFiles(candidateRoot)
    const violations: PatchViolation[] = []
    const warnings: PatchViolation[] = []
    const files: PatchFileSummary[] = []
    let patchBytes = 0
    let totalAddedLines = 0

    if (changes.length > policy.maxChangedFiles) violations.push({ code: 'PATCH_TOO_MANY_FILES', message: `一次最多修改 ${policy.maxChangedFiles} 个文件。` })
    const inferredRenames = await this.findUnstagedRenames(candidateRoot, changes)
    for (const path of inferredRenames) violations.push({ code: 'PATCH_RENAME_DENIED', path, message: '学生模式不允许重命名文件。' })

    const seenPaths = new Set<string>()
    for (const change of changes) {
      const path = this.normalizeRelativePath(change.path)
      const folded = path.toLocaleLowerCase('en-US')
      if (seenPaths.has(folded)) violations.push({ code: 'PATCH_CASE_COLLISION', path, message: '存在仅大小写不同的重复路径。' })
      seenPaths.add(folded)

      const status = mapStatus(change.code)
      const denied = [...alwaysDenied, ...policy.deniedGlobs].some((glob) => matchesGlob(path, glob))
      const allowed = policy.allowedEditGlobs.some((glob) => matchesGlob(path, glob))
      if (denied || !allowed) violations.push({ code: 'PATCH_PATH_DENIED', path, message: '这个文件不在学生可修改范围内。' })
      if (status === 'deleted') violations.push({ code: 'PATCH_DELETE_DENIED', path, message: '学生模式不允许删除文件。' })
      if (status === 'renamed') violations.push({ code: 'PATCH_RENAME_DENIED', path, message: '学生模式不允许重命名文件。' })
      if (status === 'type_changed' || status === 'unmerged') violations.push({ code: 'PATCH_TYPE_DENIED', path, message: '文件类型或合并状态异常。' })

      let bytes = 0
      let additions = 0
      let deletions = 0
      if (status !== 'deleted') {
        const fullPath = this.resolveCandidatePath(candidateRoot, path)
        await this.assertNoLinkedSegments(candidateRoot, path)
        const info = await lstat(fullPath)
        if (!info.isFile()) violations.push({ code: 'PATCH_LINK_DENIED', path, message: '不允许创建链接或特殊文件。' })
        else {
          bytes = info.size
          patchBytes += bytes
          if (bytes > policy.maxSingleFileBytes) violations.push({ code: 'PATCH_FILE_TOO_LARGE', path, message: '文件大小超过学生项目限制。' })
          const content = await readFile(fullPath)
          if (content.includes(0)) violations.push({ code: 'PATCH_BINARY_DENIED', path, message: '学生模式只允许修改文本文件。' })
          else {
            const text = content.toString('utf8')
            if (secretPattern.test(text)) violations.push({ code: 'PATCH_SECRET_DENIED', path, message: '文件中疑似包含密钥或令牌。' })
            if (absoluteUserPathPattern.test(text)) violations.push({ code: 'PATCH_USER_PATH_DENIED', path, message: '文件中不能写入本机用户目录。' })
            if (/\b(?:malloc|calloc|realloc|free)\s*\(/.test(text)) warnings.push({ code: 'PATCH_DYNAMIC_MEMORY', path, message: '检测到动态内存调用，需要教师复核。' })
            if (/\bwhile\s*\(\s*(?:1|true)\s*\)/.test(text)) warnings.push({ code: 'PATCH_UNBOUNDED_LOOP', path, message: '检测到无界循环，需要教师复核。' })
          }
        }
      }
      if (change.code === '??') {
        const text = status === 'deleted' ? '' : await readFile(this.resolveCandidatePath(candidateRoot, path), 'utf8')
        additions = text.length === 0 ? 0 : text.split(/\r?\n/).length
      } else ({ additions, deletions } = await this.git.lineStats(candidateRoot, path))
      totalAddedLines += additions
      files.push({ path, status, bytes, additions, deletions })
    }

    if (patchBytes > policy.maxPatchBytes) violations.push({ code: 'PATCH_TOO_LARGE', message: '本次修改总大小超过学生项目限制。' })
    if (totalAddedLines > policy.maxAddedLines) violations.push({ code: 'PATCH_TOO_MANY_LINES', message: `一次最多新增 ${policy.maxAddedLines} 行。` })
    files.sort((left, right) => left.path.localeCompare(right.path, 'en-US'))
    return Object.freeze({
      valid: violations.length === 0,
      policyVersion: `${policy.policyProfile}:${policy.schemaVersion}`,
      files,
      violations,
      warnings,
      changedFiles: files.length,
      patchBytes
    })
  }

  private normalizeRelativePath(input: string): string {
    if (!input || isAbsolute(input) || input.includes('\0')) throw new Error('PATCH_PATH_INVALID')
    const normalized = normalize(input.replaceAll('\\', '/')).replaceAll('\\', '/')
    if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../') || normalized.startsWith('/')) throw new Error('PATCH_PATH_OUTSIDE_ROOT')
    return normalized.replace(/^\.\//, '')
  }

  private async findUnstagedRenames(candidateRoot: string, changes: Array<{ code: string; path: string }>): Promise<Set<string>> {
    const deleted = changes.filter((change) => change.code.includes('D') && !change.code.includes('R'))
    const added = changes.filter((change) => change.code === '??' || change.code.includes('A'))
    const inferred = new Set<string>()
    const addedHashes = new Map<string, string>()
    for (const change of added) {
      const hash = await this.git.workingFileHash(candidateRoot, change.path)
      if (hash) addedHashes.set(hash, change.path)
    }
    for (const change of deleted) {
      const hash = await this.git.headBlobHash(candidateRoot, change.path)
      const target = hash ? addedHashes.get(hash) : undefined
      if (target) inferred.add(target.replaceAll('\\', '/'))
    }
    return inferred
  }

  private resolveCandidatePath(root: string, path: string): string {
    const candidate = resolve(root, ...path.split('/'))
    const rel = relative(resolve(root), candidate)
    if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('PATCH_PATH_OUTSIDE_ROOT')
    return candidate
  }

  private async assertNoLinkedSegments(root: string, path: string): Promise<void> {
    let current = resolve(root)
    for (const segment of path.split('/')) {
      current = join(current, segment)
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new Error('PATCH_LINK_DENIED')
    }
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(current)])
    const rel = relative(realRoot, realFile)
    if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('PATCH_PATH_OUTSIDE_ROOT')
  }
}

function mapStatus(code: string): PatchFileSummary['status'] {
  if (code === '??' || code.includes('A')) return 'added'
  if (code.includes('D')) return 'deleted'
  if (code.includes('R') || code.includes('C')) return 'renamed'
  if (code.includes('T')) return 'type_changed'
  if (code.includes('U')) return 'unmerged'
  return 'modified'
}

function matchesGlob(path: string, glob: string): boolean {
  const normalizedPath = path.replaceAll('\\', '/').toLocaleLowerCase('en-US')
  const normalizedGlob = glob.replaceAll('\\', '/').toLocaleLowerCase('en-US')
  let pattern = '^'
  for (let index = 0; index < normalizedGlob.length; index += 1) {
    const character = normalizedGlob[index]
    if (character === '*' && normalizedGlob[index + 1] === '*') {
      index += 1
      if (normalizedGlob[index + 1] === '/') { index += 1; pattern += '(?:.*/)?' }
      else pattern += '.*'
    } else if (character === '*') pattern += '[^/]*'
    else if (character === '?') pattern += '[^/]'
    else pattern += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  }
  return new RegExp(`${pattern}$`, 'i').test(normalizedPath)
}
