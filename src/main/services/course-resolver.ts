import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface CourseResolverOptions {
  bundledRoot: string
  userDataCoursesRoot: string
}

export interface CachedCourseState {
  version: number
  updatedAt?: string
}

export class CourseResolver {
  private readonly bundledRoot: string
  private readonly userDataCoursesRoot: string
  private readonly currentDir: string
  private readonly stateFile: string

  constructor(options: CourseResolverOptions) {
    this.bundledRoot = resolve(options.bundledRoot)
    this.userDataCoursesRoot = resolve(options.userDataCoursesRoot)
    this.currentDir = join(this.userDataCoursesRoot, 'current')
    this.stateFile = join(this.userDataCoursesRoot, 'state.json')
  }

  getBundledRoot(): string {
    return this.bundledRoot
  }

  getUserDataCoursesRoot(): string {
    return this.userDataCoursesRoot
  }

  getCurrentDir(): string {
    return this.currentDir
  }

  getStateFile(): string {
    return this.stateFile
  }

  hasValidDownloadedCourse(): boolean {
    const catalogPath = join(this.currentDir, 'catalog.json')
    if (!existsSync(catalogPath)) return false
    try {
      const content = readFileSync(catalogPath, 'utf8')
      const parsed = JSON.parse(content)
      return Boolean(parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.courses))
    } catch {
      return false
    }
  }

  resolveCourseRoot(): string {
    if (this.hasValidDownloadedCourse()) {
      return this.currentDir
    }
    return this.bundledRoot
  }

  getCachedState(): CachedCourseState | undefined {
    if (!existsSync(this.stateFile)) return undefined
    try {
      const content = readFileSync(this.stateFile, 'utf8')
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
}
