import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { CourseService } from '../src/main/services/course-service'
import { hardwarePublicationAllowed } from '../src/shared/course-publication'

const root = process.cwd()
const courseRoot = resolve(root, 'resources/courses/ti-mspm0-foundations')
const service = new CourseService({ rootDir: courseRoot, templatesRoot: resolve(root, 'resources/workspace-templates'), includeDrafts: true })
const courses = await service.listCourses()
if (courses.length !== 1 || courses[0].courseId !== 'ti-mspm0-gpio-foundations') throw new Error('TI MSPM0 课程目录无效')
const detail = await service.getCourse(courses[0].courseId)
if (detail.lessons.length !== 1) throw new Error('TI 入门课程应包含一个第一课')
const lesson = await service.getLesson(detail.courseId, detail.lessons[0].lessonId)
if (lesson.templateId !== 'ti-mspm0g3507-foundations' || lesson.hardware !== 'required') throw new Error('TI 第一课模板或硬件要求无效')
if (lesson.status === 'published' && !hardwarePublicationAllowed(lesson)) throw new Error('TI 硬件课发布前必须完成真机验收或记录维护者的明确发布授权')
if (lesson.status === 'draft' && lesson.verification !== 'pending-hardware-check') throw new Error('TI 作者验证课必须明确待真机验收')
for (const file of ['gpio_toggle_output.syscfg', 'src/main.c', 'gcc/device_linker.lds']) {
  if (!(await stat(resolve(root, 'resources/workspace-templates', lesson.templateId, file))).isFile()) throw new Error('TI 模板缺少 '+file)
}
const lecture = await service.getLecture(detail.courseId, lesson.lessonId)
if (lecture.status !== 'ready') throw new Error('TI 讲义无效：'+lecture.status+(lecture.status === 'invalid' ? ':'+lecture.errorCode : ''))
const dir = join(courseRoot, detail.courseId)
const assetDigests: Record<string, string> = {}
for (const asset of lecture.document.assets) {
  const loaded = await service.getLectureAsset(detail.courseId, lesson.lessonId, lecture.document.documentDigest, asset.assetId)
  assetDigests[asset.assetId] = createHash('sha256').update(Buffer.from(loaded.dataBase64, 'base64')).digest('hex')
}
const generated = {
  schemaVersion: 1, contentVersion: detail.contentVersion,
  courseSemanticSha256: hash(JSON.parse(await readFile(join(dir, 'course.json'), 'utf8'))),
  lessonSemanticSha256: { [lesson.lessonId]: hash(JSON.parse(await readFile(join(dir, 'lessons', lesson.lessonId+'.json'), 'utf8'))) },
  lectureDocumentDigest: { [lesson.lessonId]: lecture.document.documentDigest },
  lectureAssetSha256: assetDigests
}
if (process.env.ROBOTDOG_PRINT_COURSE_FINGERPRINT === '1') console.log(JSON.stringify(generated, null, 2))
else {
  const frozen = JSON.parse(await readFile(join(dir, 'compatibility', 'content-v'+detail.contentVersion+'.json'), 'utf8'))
  if (hash(generated) !== hash(frozen)) throw new Error('TI 同版本课程内容或图片已变化，请递增 contentVersion 并冻结新版指纹')
}
console.log('TI_MSPM0_COURSE_OK courses=1 lessons=1 lectures=1 status='+lesson.status+'-'+lesson.verification+' assets='+lecture.document.assets.length)
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable((value as Record<string, unknown>)[key])]))
  return value
}
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex') }
