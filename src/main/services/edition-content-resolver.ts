import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { EditionId } from '../../shared/edition'

export interface EditionContentResolverOptions {
  staticRoot: string
  userDataContentRoot: string
  editionId?: EditionId
}

export interface CachedContentState {
  version: number
  updatedAt?: string
}

export class EditionContentResolver {
  private readonly staticRoot: string
  private readonly userDataContentRoot: string
  private readonly editionId: EditionId

  constructor(options: EditionContentResolverOptions) {
    this.staticRoot = resolve(options.staticRoot)
    this.userDataContentRoot = resolve(options.userDataContentRoot)
    this.editionId = options.editionId ?? 'mcu-foundations'
  }

  getStaticRoot(): string {
    return this.staticRoot
  }

  getUserDataContentRoot(): string {
    return this.userDataContentRoot
  }

  getEditionId(): EditionId {
    return this.editionId
  }

  getCurrentDir(editionId?: EditionId | string): string {
    const id = (editionId as EditionId) ?? this.editionId
    return join(this.userDataContentRoot, id, 'current')
  }

  getStateFile(editionId?: EditionId | string): string {
    const id = (editionId as EditionId) ?? this.editionId
    return join(this.userDataContentRoot, id, 'state.json')
  }

  hasValidDownloadedContent(editionId?: EditionId | string): boolean {
    const targetEdition = (editionId as EditionId) ?? this.editionId
    const currentDir = this.getCurrentDir(targetEdition)
    if (!existsSync(currentDir)) return false

    // 1. Verify courses directory and catalog.json if this edition has courses
    const coursesDir = join(currentDir, 'courses')
    const catalogPath = join(coursesDir, 'catalog.json')
    if (targetEdition === 'mcu-foundations' || targetEdition === 'ti-mspm0-foundations') {
      if (!existsSync(catalogPath)) return false
      try {
        const content = readFileSync(catalogPath, 'utf8')
        const parsed = JSON.parse(content)
        if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.courses) || parsed.courses.length === 0) {
          return false
        }
        if (!this.isCatalogMatchingEdition(parsed.courses, targetEdition)) {
          return false
        }
      } catch {
        return false
      }
    }

    // 2. Verify workspace-templates directory exists
    const templatesDir = join(currentDir, 'workspace-templates')
    if (!existsSync(templatesDir)) return false

    // 3. Verify firmware-baselines directory exists
    const baselinesDir = join(currentDir, 'firmware-baselines')
    if (!existsSync(baselinesDir)) return false

    // Basic structure check passed
    return true
  }

  resolveCourseRoot(editionId?: EditionId | string): string {
    const targetEdition = (editionId as EditionId) ?? this.editionId
    if (this.hasValidDownloadedContent(targetEdition)) {
      return join(this.getCurrentDir(targetEdition), 'courses')
    }
    const editionSubdir = targetEdition === 'ti-mspm0-foundations' ? 'ti-mspm0-foundations' : 'mcu-foundations'
    return join(this.staticRoot, 'courses', editionSubdir)
  }

  resolveWorkspaceTemplateRoot(editionId?: EditionId | string): string {
    const targetEdition = (editionId as EditionId) ?? this.editionId
    if (this.hasValidDownloadedContent(targetEdition)) {
      return join(this.getCurrentDir(targetEdition), 'workspace-templates')
    }
    return join(this.staticRoot, 'workspace-templates')
  }

  resolveFirmwareBaselineRoot(editionId?: EditionId | string): string {
    const targetEdition = (editionId as EditionId) ?? this.editionId
    if (this.hasValidDownloadedContent(targetEdition)) {
      return join(this.getCurrentDir(targetEdition), 'firmware-baselines')
    }
    return join(this.staticRoot, 'firmware-baselines')
  }

  getCachedState(editionId?: EditionId | string): CachedContentState | undefined {
    const targetEdition = (editionId as EditionId) ?? this.editionId
    const stateFile = this.getStateFile(targetEdition)
    if (!existsSync(stateFile)) return undefined
    try {
      const content = readFileSync(stateFile, 'utf8')
      const parsed = JSON.parse(content)
      if (typeof parsed.version === 'number') {
        return {
          version: parsed.version,
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined
        }
      }
    } catch {
      // ignore corrupt state.json
    }
    return undefined
  }

  // Backwards compatibility helpers
  hasValidDownloadedCourse(editionId?: EditionId | string): boolean {
    return this.hasValidDownloadedContent(editionId)
  }

  getBundledRoot(): string {
    return this.resolveCourseRoot()
  }

  getUserDataCoursesRoot(): string {
    return this.userDataContentRoot
  }

  private isCatalogMatchingEdition(courses: Array<{ courseId: string }>, editionId: string): boolean {
    if (editionId === 'ti-mspm0-foundations') {
      return courses.some((c) => c.courseId.startsWith('ti-mspm0'))
    }
    if (editionId === 'mcu-foundations') {
      return courses.some((c) => c.courseId.startsWith('ch32'))
    }
    return true
  }
}
