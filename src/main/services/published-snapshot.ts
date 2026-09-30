import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export interface PublishedSnapshotOptions {
  editionId: 'mcu-foundations' | 'ti-mspm0-foundations'
  studioRoot: string
  outputDir: string
}

export interface PublishedSnapshotResult {
  editionId: string
  publishedCourses: Array<{
    courseId: string
    publishedLessonIds: string[]
  }>
  publishedTemplateIds: string[]
}

function copyDirectoryFiltered(
  srcDir: string,
  destDir: string,
  ignoreNames: Set<string> = new Set(['.git', 'build', 'out', 'node_modules', '.firmware-build'])
): void {
  if (!existsSync(srcDir)) return
  mkdirSync(destDir, { recursive: true })
  const entries = readdirSync(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    if (ignoreNames.has(entry.name)) continue
    if (entry.name.endsWith('.o') || entry.name.endsWith('.elf') || entry.name.endsWith('.hex') || entry.name.endsWith('.bin')) continue
    const srcPath = join(srcDir, entry.name)
    const destPath = join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyDirectoryFiltered(srcPath, destPath, ignoreNames)
    } else if (entry.isFile()) {
      cpSync(srcPath, destPath)
    }
  }
}

export function exportPublishedSnapshot(options: PublishedSnapshotOptions): PublishedSnapshotResult {
  const { editionId, studioRoot, outputDir } = options
  const resolvedStudioRoot = resolve(studioRoot)
  const resolvedOutputDir = resolve(outputDir)

  // Ensure clean target directories
  const targetCoursesDir = join(resolvedOutputDir, 'courses')
  const targetTemplatesDir = join(resolvedOutputDir, 'workspace-templates')
  const targetBaselinesDir = join(resolvedOutputDir, 'firmware-baselines')

  if (existsSync(targetCoursesDir)) rmSync(targetCoursesDir, { recursive: true, force: true })
  if (existsSync(targetTemplatesDir)) rmSync(targetTemplatesDir, { recursive: true, force: true })
  if (existsSync(targetBaselinesDir)) rmSync(targetBaselinesDir, { recursive: true, force: true })

  mkdirSync(targetCoursesDir, { recursive: true })
  mkdirSync(targetTemplatesDir, { recursive: true })
  mkdirSync(targetBaselinesDir, { recursive: true })

  const publishedCourses: Array<{ courseId: string; publishedLessonIds: string[] }> = []
  const publishedTemplateIds = new Set<string>()

  if (editionId === 'mcu-foundations') {
    const studioCoursesDir = join(resolvedStudioRoot, 'resources', 'courses', 'mcu-foundations')
    const catalogPath = join(studioCoursesDir, 'catalog.json')
    if (!existsSync(catalogPath)) throw new Error(`CATALOG_NOT_FOUND:${catalogPath}`)

    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as {
      schemaVersion: number
      courses: Array<{ courseId: string; manifest: string }>
    }

    const filteredCatalogCourses: Array<{ courseId: string; manifest: string }> = []

    for (const entry of catalog.courses) {
      const courseManifestPath = join(studioCoursesDir, entry.manifest)
      if (!existsSync(courseManifestPath)) continue
      const course = JSON.parse(readFileSync(courseManifestPath, 'utf8')) as {
        schemaVersion: number
        courseId: string
        contentVersion: number
        status: string
        lessonOrder: string[]
        [key: string]: unknown
      }

      if (course.status !== 'published') {
        // Skip draft courses entirely
        continue
      }

      const courseRelativeDir = dirname(entry.manifest)
      const courseSrcDir = join(studioCoursesDir, courseRelativeDir)
      const courseDestDir = join(targetCoursesDir, courseRelativeDir)
      mkdirSync(courseDestDir, { recursive: true })

      const publishedLessonIds: string[] = []

      // Filter lessons
      for (const lessonId of course.lessonOrder) {
        const lessonPath = join(courseSrcDir, 'lessons', `${lessonId}.json`)
        if (!existsSync(lessonPath)) continue
        const lesson = JSON.parse(readFileSync(lessonPath, 'utf8')) as {
          schemaVersion: number
          courseId: string
          lessonId: string
          status: string
          hardware: string
          verification: string
          templateId: string
          [key: string]: unknown
        }

        if (lesson.status !== 'published') {
          // Draft lesson: skip
          continue
        }

        if (lesson.hardware === 'required' && lesson.verification !== 'hardware-checked') {
          throw new Error(`PUBLISHED_LESSON_HARDWARE_UNCHECKED:${lessonId}`)
        }

        publishedLessonIds.push(lessonId)
        publishedTemplateIds.add(lesson.templateId)

        // Copy published lesson manifest
        const destLessonsDir = join(courseDestDir, 'lessons')
        mkdirSync(destLessonsDir, { recursive: true })
        cpSync(lessonPath, join(destLessonsDir, `${lessonId}.json`))

        // Copy published lecture if exists
        const srcLectureDir = join(courseSrcDir, 'lectures', lessonId)
        if (existsSync(srcLectureDir)) {
          const destLectureDir = join(courseDestDir, 'lectures', lessonId)
          copyDirectoryFiltered(srcLectureDir, destLectureDir)
        }
      }

      // Rebuild course.json with ONLY published lessons
      const publishedCourseManifest = {
        ...course,
        lessonOrder: publishedLessonIds
      }
      writeFileSync(
        join(courseDestDir, 'course.json'),
        JSON.stringify(publishedCourseManifest, null, 2) + '\n',
        'utf8'
      )

      // Copy compatibility folder if exists
      const srcCompatDir = join(courseSrcDir, 'compatibility')
      if (existsSync(srcCompatDir)) {
        copyDirectoryFiltered(srcCompatDir, join(courseDestDir, 'compatibility'))
      }

      filteredCatalogCourses.push(entry)
      publishedCourses.push({ courseId: course.courseId, publishedLessonIds })
    }

    // Write published catalog.json
    writeFileSync(
      join(targetCoursesDir, 'catalog.json'),
      JSON.stringify({ schemaVersion: 1, courses: filteredCatalogCourses }, null, 2) + '\n',
      'utf8'
    )

    // 2. Workspace templates: copy ONLY published lesson templates
    const mcuLessonsTargetDir = join(targetTemplatesDir, 'ch32v203-mcu-lessons')
    mkdirSync(mcuLessonsTargetDir, { recursive: true })
    const studioMcuLessonsTemplatesDir = join(resolvedStudioRoot, 'resources', 'workspace-templates', 'ch32v203-mcu-lessons')

    for (const templateId of publishedTemplateIds) {
      const srcTemplate = join(studioMcuLessonsTemplatesDir, templateId)
      if (existsSync(srcTemplate)) {
        copyDirectoryFiltered(srcTemplate, join(mcuLessonsTargetDir, templateId))
      }
    }

    // Copy generic templates: pony & mcu-foundations
    copyDirectoryFiltered(
      join(resolvedStudioRoot, 'resources', 'workspace-templates', 'ch32v203-pony'),
      join(targetTemplatesDir, 'ch32v203-pony')
    )
    copyDirectoryFiltered(
      join(resolvedStudioRoot, 'resources', 'workspace-templates', 'ch32v203-mcu-foundations'),
      join(targetTemplatesDir, 'ch32v203-mcu-foundations')
    )

    // 3. Firmware baselines
    // 3a. ch32v203-rhs
    const targetRhsDir = join(targetBaselinesDir, 'ch32v203-rhs')
    mkdirSync(targetRhsDir, { recursive: true })
    cpSync(
      join(resolvedStudioRoot, 'resources', 'firmware-baselines', 'ch32v203-rhs', 'active.json'),
      join(targetRhsDir, 'active.json')
    )
    cpSync(
      join(resolvedStudioRoot, 'resources', 'firmware-baselines', 'ch32v203-rhs', 'rhs.firmware.json'),
      join(targetRhsDir, 'rhs.firmware.json')
    )
    copyDirectoryFiltered(
      join(resolvedStudioRoot, 'firmware', 'ch32v203-baseline'),
      join(targetRhsDir, 'current', 'source')
    )

    // 3b. ch32v203-pony
    const targetPonyDir = join(targetBaselinesDir, 'ch32v203-pony')
    mkdirSync(targetPonyDir, { recursive: true })
    cpSync(
      join(resolvedStudioRoot, 'resources', 'firmware-baselines', 'ch32v203-pony', 'active.json'),
      join(targetPonyDir, 'active.json')
    )
    cpSync(
      join(resolvedStudioRoot, 'resources', 'firmware-baselines', 'ch32v203-pony', 'pony.firmware.json'),
      join(targetPonyDir, 'pony.firmware.json')
    )
    copyDirectoryFiltered(
      join(resolvedStudioRoot, 'firmware', 'v2.5_沁恒小马例程'),
      join(targetPonyDir, 'current', 'source')
    )
  } else if (editionId === 'ti-mspm0-foundations') {
    // 1. courses
    copyDirectoryFiltered(
      join(resolvedStudioRoot, 'resources', 'courses', 'ti-mspm0-foundations'),
      targetCoursesDir
    )
    publishedCourses.push({
      courseId: 'ti-mspm0-gpio-foundations',
      publishedLessonIds: ['ti-mspm0-gpio-toggle']
    })
    publishedTemplateIds.add('ti-mspm0g3507-foundations')

    // 2. workspace-templates
    copyDirectoryFiltered(
      join(resolvedStudioRoot, 'resources', 'workspace-templates', 'ti-mspm0g3507-foundations'),
      join(targetTemplatesDir, 'ti-mspm0g3507-foundations')
    )

    // 3. firmware-baselines
    const targetTiBaselineDir = join(targetBaselinesDir, 'ti-mspm0g3507')
    mkdirSync(targetTiBaselineDir, { recursive: true })
    cpSync(
      join(resolvedStudioRoot, 'resources', 'firmware-baselines', 'ti-mspm0g3507', 'active.json'),
      join(targetTiBaselineDir, 'active.json')
    )
    cpSync(
      join(resolvedStudioRoot, 'resources', 'firmware-baselines', 'ti-mspm0g3507', 'ti-mspm0g3507.firmware.json'),
      join(targetTiBaselineDir, 'ti-mspm0g3507.firmware.json')
    )
    copyDirectoryFiltered(
      join(resolvedStudioRoot, 'resources', 'workspace-templates', 'ti-mspm0g3507-foundations'),
      join(targetTiBaselineDir, 'current', 'source')
    )
  }

  return {
    editionId,
    publishedCourses,
    publishedTemplateIds: [...publishedTemplateIds]
  }
}
