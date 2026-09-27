import { EditionContentUpdateService, type EditionContentUpdateServiceOptions, type RemoteContentManifest, isAppVersionCompatible } from './edition-content-update-service'
import type { CourseResolver } from './course-resolver'

export type CourseUpdateServiceOptions = EditionContentUpdateServiceOptions & {
  resolver?: CourseResolver
}

export type RemoteCourseManifest = RemoteContentManifest

export { isAppVersionCompatible }

export class CourseUpdateService extends EditionContentUpdateService {
  constructor(options: CourseUpdateServiceOptions) {
    super(options)
  }
}
