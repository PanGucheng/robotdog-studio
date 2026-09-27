import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface CourseResolverOptions {
  bundledRoot: string
  userDataCoursesRoot: string
  editionId?: string
}

export interface CachedCourseState {
  version: number
  updatedAt?: string
}

export class CourseResolver {
  private readonly bundledRoot: string
  private readonly userDataCoursesRoot: string
  private readonly editionId: string

  constructor(options: CourseResolverOptions) {
    this.bundledRoot = resolve(options.bundledRoot)
    this.userDataCoursesRoot = resolve(options.userDataCoursesRoot)
    this.editionId = options.editionId ?? 'mcu-foundations'
    this.migrateLegacyMcuCacheIfNeeded()
  }

  getBundledRoot(): string {
    return this.bundledRoot
  }

  getUserDataCoursesRoot(): string {
    return this.userDataCoursesRoot
  }

  getEditionId(): string {
    return this.editionId
  }

  getCurrentDir(editionId?: string): string {
    const id = editionId ?? this.editionId
    return join(this.userDataCoursesRoot, id, 'current')
  }

  getStateFile(editionId?: string): string {
    const id = editionId ?? this.editionId
    return join(this.userDataCoursesRoot, id, 'state.json')
  }

  hasValidDownloadedCourse(editionId?: string): boolean {
    const targetEdition = editionId ?? this.editionId
    const currentDir = this.getCurrentDir(targetEdition)
    const catalogPath = join(currentDir, 'catalog.json')
    if (!existsSync(catalogPath)) return false
    try {
      const content = readFileSync(catalogPath, 'utf8')
      const parsed = JSON.parse(content)
      if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.courses) || parsed.courses.length === 0) {
        return false
      }
      return this.isCatalogMatchingEdition(parsed.courses, targetEdition)
    } catch {
      return false
    }
  }

  resolveCourseRoot(editionId?: string): string {
    const targetEdition = editionId ?? this.editionId
    if (this.hasValidDownloadedCourse(targetEdition)) {
      return this.getCurrentDir(targetEdition)
    }
    return this.bundledRoot
  }

  getCachedState(editionId?: string): CachedCourseState | undefined {
    const targetEdition = editionId ?? this.editionId
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

  private isCatalogMatchingEdition(courses: Array<{ courseId: string }>, editionId: string): boolean {
    if (editionId === 'ti-mspm0-foundations') {
      return courses.some((c) => c.courseId.startsWith('ti-mspm0'))
    }
    if (editionId === 'mcu-foundations') {
      return courses.some((c) => c.courseId.startsWith('ch32'))
    }
    return true
  }

  private migrateLegacyMcuCacheIfNeeded(): void {
    const legacyCurrent = join(this.userDataCoursesRoot, 'current')
    const legacyState = join(this.userDataCoursesRoot, 'state.json')
    const mcuDir = join(this.userDataCoursesRoot, 'mcu-foundations')
    const mcuCurrent = join(mcuDir, 'current')

    if (existsSync(legacyCurrent) && !existsSync(mcuCurrent)) {
      try {
        mkdirSync(mcuDir, { recursive: true })
        renameSync(legacyCurrent, mcuCurrent)
        if (existsSync(legacyState)) {
          renameSync(legacyState, join(mcuDir, 'state.json'))
        }
      } catch {
        // ignore legacy migration failure
      }
    }
  }
}
