import { BookOpenCheck, ChevronRight, Clock3, Cpu, FlaskConical, GraduationCap, LockKeyhole } from 'lucide-react'
import type { CourseDetail, CourseLesson, CourseLessonSummary, CourseSummary } from '../../../shared/types'

interface CourseCenterProps {
  courses: CourseSummary[]
  course?: CourseDetail
  lesson?: CourseLesson
  loading: boolean
  error?: string
  completedLessonIds: string[]
  onSelectLesson(lessonId: string): void
  onOpenLesson(lessonId: string): void
}

const hardwareLabels = {
  none: '无需硬件',
  optional: '硬件可选',
  required: '需要开发板'
} as const

export function CourseCenter({ courses, course, lesson, loading, error, completedLessonIds, onSelectLesson, onOpenLesson }: CourseCenterProps): React.JSX.Element {
  if (loading && !course) {
    return <div className="course-center-state"><Cpu className="spin" size={22} /><strong>正在读取课程目录</strong><span>课程内容保存在本机，可离线使用。</span></div>
  }
  if (error) {
    return <div className="course-center-state is-error"><BookOpenCheck size={22} /><strong>课程目录暂时不可用</strong><span>{error}</span></div>
  }
  if (!course) {
    return <div className="course-center-state"><BookOpenCheck size={22} /><strong>还没有可用课程</strong><span>普通 MCU 项目仍可继续使用。</span></div>
  }

  return (
    <div className="course-center">
      <header className="course-center-hero">
        <div className="course-chip" aria-hidden="true"><span /><Cpu size={25} /><span /></div>
        <div>
          <span className="eyebrow">Course board · v{course.contentVersion}</span>
          <h2>{course.title}</h2>
          <p>{course.summary}</p>
        </div>
        <dl>
          <div><dt>学习对象</dt><dd>{course.audience}</dd></div>
          <div><dt>课程规模</dt><dd>{course.lessonCount} 个课次</dd></div>
          <div><dt>目标平台</dt><dd>{course.boardScope}</dd></div>
        </dl>
      </header>

      <div className="course-center-layout">
        <aside className="course-lesson-rail" aria-label="课次列表">
          <div className="course-rail-heading"><GraduationCap size={16} /><span><strong>课程路径</strong><small>{courses.length} 门本地课程</small></span></div>
          <div className="course-rail-track">
            {course.lessons.map((item) => (
              <LessonRailButton key={item.lessonId} lesson={item} active={lesson?.lessonId === item.lessonId} completed={completedLessonIds.includes(item.lessonId)} onSelect={onSelectLesson} />
            ))}
          </div>
        </aside>

        <section className="course-lesson-detail">
          {lesson ? <>
            <div className="lesson-detail-head">
              <div>
                <span className="lesson-sequence">LESSON {String(lesson.order + 1).padStart(2, '0')}</span>
                <h3>{lesson.title}</h3>
                <p>{lesson.summary}</p>
              </div>
              <div className="lesson-badges">
                <span><Clock3 size={13} /> {lesson.estimatedMinutes} 分钟</span>
                <span className={lesson.hardware === 'required' ? 'is-hardware' : ''}><FlaskConical size={13} /> {hardwareLabels[lesson.hardware]}</span>
                {lesson.status === 'draft' && <span className="is-draft">待验证</span>}
              </div>
            </div>

            {lesson.verification === 'pending-hardware-check' && (
              <div className="course-hardware-warning"><LockKeyhole size={17} /><span><strong>本课尚未通过真机检查</strong>当前只展示课程结构，不要据此接线或烧录。</span></div>
            )}

            {lesson.prerequisites.length > 0 && (
              <div className="lesson-prerequisites"><span>建议先完成</span>{lesson.prerequisites.map((lessonId) => <strong key={lessonId}>{course.lessons.find((item) => item.lessonId === lessonId)?.title ?? lessonId}</strong>)}</div>
            )}

            <div className="lesson-objectives">
              <span className="eyebrow">完成这节课后</span>
              <ul>{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
            </div>

            <div className="lesson-preview lesson-preview-summary">
              <div><BookOpenCheck size={20} /><span><strong>讲义学习</strong><small>按知识章节阅读并记录学习进度</small></span></div>
              <div><FlaskConical size={20} /><span><strong>{lesson.steps.length} 个实验步骤</strong><small>学习后进入独立实验工程验证</small></span></div>
            </div>

            <footer className="lesson-detail-actions">
              <span>{lesson.status === 'draft' ? '课程发布后才可开始学习。' : '先阅读课程讲义，再进入配套实验工程。'}</span>
              <div>
                <button type="button" className="course-start-button" disabled={lesson.status !== 'published' || lesson.verification === 'pending-hardware-check'} onClick={() => {
                  const incomplete = lesson.prerequisites.filter((lessonId) => !completedLessonIds.includes(lessonId))
                  if (incomplete.length > 0 && !window.confirm('建议先完成前置课。是否仍要开始学习？')) return
                  onOpenLesson(lesson.lessonId)
                }}>开始学习</button>
              </div>
            </footer>
          </> : <div className="course-center-state"><BookOpenCheck size={22} /><strong>选择一个课次</strong><span>查看目标、实验步骤和硬件要求。</span></div>}
        </section>
      </div>
    </div>
  )
}

function LessonRailButton({ lesson, active, completed, onSelect }: { lesson: CourseLessonSummary; active: boolean; completed: boolean; onSelect(lessonId: string): void }): React.JSX.Element {
  return (
    <button type="button" className={active ? 'active' : ''} onClick={() => onSelect(lesson.lessonId)} aria-current={active ? 'step' : undefined}>
      <span className="lesson-node">{String(lesson.order + 1).padStart(2, '0')}</span>
      <span className="lesson-rail-copy"><strong>{lesson.title}</strong><small>{lesson.estimatedMinutes} 分钟 · {hardwareLabels[lesson.hardware]}</small></span>
      {completed ? <BookOpenCheck size={15} /> : <ChevronRight size={15} />}
    </button>
  )
}
