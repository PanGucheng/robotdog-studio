import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { EditionContentResolver, type CachedContentState } from './edition-content-resolver'
import type { EditionId } from '../../shared/edition'

export interface CourseResolverOptions {
  bundledRoot?: string
  staticRoot?: string
  userDataCoursesRoot?: string
  userDataContentRoot?: string
  editionId?: string
}

export type CachedCourseState = CachedContentState

export class CourseResolver extends EditionContentResolver {
  private readonly legacyBundledRoot?: string

  constructor(options: CourseResolverOptions) {
    const staticRoot = options.staticRoot ?? (options.bundledRoot ? resolve(options.bundledRoot, '..', '..') : '')
    const contentRoot = options.userDataContentRoot ?? options.userDataCoursesRoot ?? ''
    const editionId = (options.editionId ?? 'mcu-foundations') as EditionId

    super({
      staticRoot,
      userDataContentRoot: contentRoot,
      editionId
    })

    if (options.bundledRoot) {
      this.legacyBundledRoot = resolve(options.bundledRoot)
    }

    if (options.userDataCoursesRoot) {
      this.migrateLegacyMcuCacheIfNeeded(options.userDataCoursesRoot)
    }
  }

  override getBundledRoot(): string {
    return this.legacyBundledRoot ?? super.getBundledRoot()
  }

  override resolveCourseRoot(editionId?: EditionId | string): string {
    const targetEdition = (editionId as EditionId) ?? this.getEditionId()
    if (this.hasValidDownloadedContent(targetEdition)) {
      const currentDir = this.getCurrentDir(targetEdition)
      const coursesSub = join(currentDir, 'courses')
      if (existsSync(join(coursesSub, 'catalog.json'))) {
        return coursesSub
      }
      if (existsSync(join(currentDir, 'catalog.json'))) {
        return currentDir
      }
    }
    return this.legacyBundledRoot ?? super.resolveCourseRoot(targetEdition)
  }

  override hasValidDownloadedContent(editionId?: EditionId | string): boolean {
    const targetEdition = (editionId as EditionId) ?? this.getEditionId()
    const currentDir = this.getCurrentDir(targetEdition)
    if (!existsSync(currentDir)) return false

    // Support both unified content.zip structure (current/courses/catalog.json)
    // and legacy pure course structure (current/catalog.json)
    const catalogPath = existsSync(join(currentDir, 'courses', 'catalog.json'))
      ? join(currentDir, 'courses', 'catalog.json')
      : join(currentDir, 'catalog.json')

    if (!existsSync(catalogPath)) return false
    try {
      const content = readFileSync(catalogPath, 'utf8')
      const parsed = JSON.parse(content)
      if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.courses) || parsed.courses.length === 0) {
        return false
      }
      if (targetEdition === 'ti-mspm0-foundations') {
        return parsed.courses.some((c: { courseId: string }) => c.courseId.startsWith('ti-mspm0'))
      }
      if (targetEdition === 'mcu-foundations') {
        return parsed.courses.some((c: { courseId: string }) => c.courseId.startsWith('ch32'))
      }
      return true
    } catch {
      return false
    }
  }

  private migrateLegacyMcuCacheIfNeeded(coursesRoot: string): void {
    const legacyCurrent = join(coursesRoot, 'current')
    const legacyState = join(coursesRoot, 'state.json')
    const mcuDir = join(coursesRoot, 'mcu-foundations')
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
