import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const root = process.cwd()
const courseRoot = resolve(root, 'resources', 'courses', 'mcu-foundations')
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const catalog = await readJsonInside(courseRoot, 'catalog.json')
requireValue(catalog?.schemaVersion === 1 && Array.isArray(catalog.courses), 'catalog.json 格式无效')
const courseIds = new Set()
let lessonCount = 0

for (const entry of catalog.courses) {
  requireId(entry?.courseId, 'catalog courseId')
  requireValue(!courseIds.has(entry.courseId), `课程 ID 重复：${entry.courseId}`)
  courseIds.add(entry.courseId)
  const course = await readJsonInside(courseRoot, entry.manifest)
  requireValue(course?.schemaVersion === 1 && course.courseId === entry.courseId, `课程 manifest 身份不一致：${entry.courseId}`)
  requireValue(Number.isInteger(course.contentVersion) && course.contentVersion > 0, `课程 contentVersion 无效：${entry.courseId}`)
  requireValue(['draft', 'published'].includes(course.status), `课程状态无效：${entry.courseId}`)
  requireValue(Array.isArray(course.lessonOrder) && course.lessonOrder.length > 0, `课程没有课次：${entry.courseId}`)
  const lessonIds = new Set(course.lessonOrder)
  requireValue(lessonIds.size === course.lessonOrder.length, `课次顺序存在重复 ID：${entry.courseId}`)
  for (const lessonId of course.lessonOrder) {
    requireId(lessonId, 'lessonId')
    const lessonPath = `${entry.manifest.replace(/\\/g, '/').replace(/\/[^/]+$/, '')}/lessons/${lessonId}.json`
    const lesson = await readJsonInside(courseRoot, lessonPath)
    requireValue(lesson?.schemaVersion === 1 && lesson.courseId === entry.courseId && lesson.lessonId === lessonId, `课次身份不一致：${lessonId}`)
    requireValue(['draft', 'published'].includes(lesson.status), `课次状态无效：${lessonId}`)
    requireValue(['none', 'optional', 'required'].includes(lesson.hardware), `课次硬件要求无效：${lessonId}`)
    requireValue(['not-required', 'pending-hardware-check', 'hardware-checked'].includes(lesson.verification), `课次验证状态无效：${lessonId}`)
    requireValue(Array.isArray(lesson.steps) && lesson.steps.length > 0, `课次没有实验步骤：${lessonId}`)
    requireValue(Array.isArray(lesson.prerequisites) && lesson.prerequisites.every((item) => lessonIds.has(item) && item !== lessonId), `课次前置引用无效：${lessonId}`)
    requireId(lesson.templateId, `templateId (${lessonId})`)
    const templateRoot = await resolveTemplateRoot(lesson.templateId)
    requireValue(await directoryExists(templateRoot), `课次模板不存在：${lesson.templateId}`)
    lessonCount += 1
  }
}

console.log(`MCU_COURSES_OK courses=${courseIds.size} lessons=${lessonCount}`)

async function resolveTemplateRoot(templateId) {
  if (templateId === 'ch32v203-mcu-foundations') {
    const registry = JSON.parse(await readFile(join(root, 'resources', 'firmware-baselines', 'ch32v203-robotdog', 'active.json'), 'utf8'))
    return join(root, 'resources', 'workspace-templates', templateId, registry.shortCommit ?? '2026.06')
  }
  return join(root, 'resources', 'workspace-templates', 'ch32v203-mcu-lessons', templateId)
}

async function readJsonInside(base, relativePath) {
  requireValue(typeof relativePath === 'string' && relativePath.length > 0 && !isAbsolute(relativePath), '课程资源路径无效')
  const target = resolve(base, ...relativePath.replace(/\\/g, '/').split('/'))
  const fromBase = relative(base, target)
  requireValue(fromBase && fromBase !== '..' && !fromBase.startsWith(`..${sep}`) && !isAbsolute(fromBase), `课程资源路径越界：${relativePath}`)
  return JSON.parse(await readFile(target, 'utf8'))
}

function requireId(value, label) {
  requireValue(typeof value === 'string' && idPattern.test(value), `${label} 无效：${String(value)}`)
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message)
}

async function directoryExists(path) {
  return stat(path).then((info) => info.isDirectory(), () => false)
}
