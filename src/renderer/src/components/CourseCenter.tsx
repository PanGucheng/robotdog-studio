import { BookOpenCheck, ChevronRight, Clock3, Cpu, FlaskConical, GraduationCap, LockKeyhole } from 'lucide-react'
import type { CourseDetail, CourseLesson, CourseLessonSummary, CourseSummary, WorkspaceSummary } from '../../../shared/types'

interface CourseCenterProps {
  courses: CourseSummary[]
  course?: CourseDetail
  lesson?: CourseLesson
  loading: boolean
  error?: string
  attempts: WorkspaceSummary[]
  busy: boolean
  onSelectLesson(lessonId: string): void
  onCreateLessonAttempt(lessonId: string): Promise<boolean>
  onContinueAttempt(workspaceId: string): void
}

const hardwareLabels = {
  none: '无需硬件',
  optional: '硬件可选',
  required: '需要开发板'
} as const

export function CourseCenter({ courses, course, lesson, loading, error, attempts, busy, onSelectLesson, onCreateLessonAttempt, onContinueAttempt }: CourseCenterProps): React.JSX.Element {
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
              <LessonRailButton key={item.lessonId} lesson={item} active={lesson?.lessonId === item.lessonId} onSelect={onSelectLesson} />
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

            <div className="lesson-preview">
              <div className="lesson-preview-heading"><span className="eyebrow">实验路径</span><small>{lesson.steps.length} 个步骤</small></div>
              <ol>
                {lesson.steps.map((step, index) => (
                  <li key={step.stepId}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{step.title}</strong><p>{step.instruction}</p></div></li>
                ))}
              </ol>
            </div>

            <footer className="lesson-detail-actions">
              <span>{lesson.status === 'draft' ? '硬件课通过真机检查并发布后才能创建练习。' : attempts.length > 0 ? `已保留 ${attempts.length} 次独立练习。` : '将从本课专用模板创建独立工程。'}</span>
              <div>
                {attempts[0] && <button type="button" onClick={() => onContinueAttempt(attempts[0].id)} disabled={busy}><BookOpenCheck size={16} /> 继续上次练习</button>}
                <button type="button" className="course-start-button" disabled={busy || lesson.status !== 'published' || lesson.verification === 'pending-hardware-check'} onClick={() => void onCreateLessonAttempt(lesson.lessonId)}>{attempts.length > 0 ? '新建练习' : '开始学习'}</button>
              </div>
            </footer>
            {attempts.length > 0 && <div className="lesson-attempts"><span className="eyebrow">练习记录</span>{attempts.map((attempt) => <button type="button" key={attempt.id} onClick={() => onContinueAttempt(attempt.id)}><strong>第 {attempt.courseBinding?.attemptNumber} 次</strong><span>{attempt.name}</span><small>{new Date(attempt.createdAt).toLocaleString('zh-CN', { hour12: false })}</small></button>)}</div>}
          </> : <div className="course-center-state"><BookOpenCheck size={22} /><strong>选择一个课次</strong><span>查看目标、实验步骤和硬件要求。</span></div>}
        </section>
      </div>
    </div>
  )
}

function LessonRailButton({ lesson, active, onSelect }: { lesson: CourseLessonSummary; active: boolean; onSelect(lessonId: string): void }): React.JSX.Element {
  return (
    <button type="button" className={active ? 'active' : ''} onClick={() => onSelect(lesson.lessonId)} aria-current={active ? 'step' : undefined}>
      <span className="lesson-node">{String(lesson.order + 1).padStart(2, '0')}</span>
      <span className="lesson-rail-copy"><strong>{lesson.title}</strong><small>{lesson.estimatedMinutes} 分钟 · {hardwareLabels[lesson.hardware]}</small></span>
      <ChevronRight size={15} />
    </button>
  )
}
