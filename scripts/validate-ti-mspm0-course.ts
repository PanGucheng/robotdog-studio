import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CourseService } from '../src/main/services/course-service'

const root = process.cwd()
const service = new CourseService({
  rootDir: resolve(root, 'resources/courses/ti-mspm0-foundations'),
  templatesRoot: resolve(root, 'resources/workspace-templates'),
  includeDrafts: true
})
const courses = await service.listCourses()
if (courses.length !== 1 || courses[0].courseId !== 'ti-mspm0-gpio-foundations') throw new Error('TI MSPM0 课程目录无效')
const detail = await service.getCourse(courses[0].courseId)
if (detail.lessons.length !== 1) throw new Error('TI MSPM0 第一阶段只能包含一个 GPIO lesson')
const lesson = await service.getLesson(detail.courseId, detail.lessons[0].lessonId)
if (lesson.templateId !== 'ti-mspm0g3507-foundations' || lesson.hardware !== 'required') throw new Error('TI GPIO lesson 的模板或硬件要求无效')
if (lesson.verification !== 'hardware-checked' || lesson.status !== 'published') throw new Error('TI GPIO lesson 必须保持已真机验证的 published 状态')
for (const path of ['gpio_toggle_output.syscfg', 'src/main.c', 'gcc/device_linker.lds']) {
  if (!(await stat(resolve(root, 'resources/workspace-templates', lesson.templateId, ...path.split('/')))).isFile()) throw new Error(`TI GPIO 模板缺少 ${path}`)
}
const lecture = await service.getLecture(detail.courseId, lesson.lessonId)
if (lecture.status !== 'ready') throw new Error(`TI GPIO 讲义无效：${lecture.status}${lecture.status === 'invalid' ? `:${lecture.errorCode}` : ''}`)
console.log('TI_MSPM0_COURSE_OK courses=1 lessons=1 lectures=1 status=published-hardware-checked')
