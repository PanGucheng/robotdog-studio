import { ArrowLeft, ArrowRight, BookOpenCheck, Clock3, Code2, FlaskConical, Plus } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import brandMotif from '../../../../resources/brand/robohorse-motif.svg'
import type { CourseDetail, LessonLearningProgress, McuRecentActivity, WorkspaceSummary } from '../../../shared/types'
import type { McuView } from './mcu-navigation'

interface McuHomeProps {
  editionId?: import('../../../shared/edition').EditionId
  panel: 'landing' | 'free-practice'
  course?: CourseDetail
  workspaces: WorkspaceSummary[]
  learning: LessonLearningProgress[]
  recent: McuRecentActivity[]
  busy: boolean
  onNavigate(view: McuView): void
  onCreateWorkspace(projectType?: import('../../../shared/types').SandboxProjectType): void
}

export function McuHome({ editionId = 'mcu-foundations', panel, course, workspaces, learning, recent, busy, onNavigate, onCreateWorkspace }: McuHomeProps): React.JSX.Element {
  const mcuWorkspaces = workspaces.filter((workspace) => workspace.learningPath === editionId)
  if (panel === 'free-practice') {
    const free = mcuWorkspaces.filter((workspace) => workspace.workspacePurpose === 'mcu-sandbox')
    return <section className="mcu-free-home">
      <button type="button" className="mcu-page-back" onClick={() => onNavigate({ kind: 'home', panel: 'landing' })}><ArrowLeft size={15} /> 返回首页</button>
      <header><span className="eyebrow">FREE WORKSHOP</span><h1>自由练习</h1><p>选择基础 SDK 空工程从零编写，或使用完整小马例程继续开发。</p></header>
      <div className="sandbox-template-choices" aria-label="创建自由练习工程">
        <button type="button" className="mcu-create-free" onClick={() => onCreateWorkspace('sdk-empty')} disabled={busy}><span><Plus size={22} /></span><strong>基础 SDK 空工程</strong><small>保留启动、链接和 SDK 配置，从最小 main() 开始编写程序。</small><ArrowRight size={18} /></button>
        <button type="button" className="mcu-create-free" onClick={() => onCreateWorkspace('pony')} disabled={busy}><span><Code2 size={22} /></span><strong>完整小马例程</strong><small>{editionId === 'ti-mspm0-foundations' ? 'TI 小马移植例程：串口、舵机、OLED 和运动控制。真机待验收，不含 CCD 巡线和 IAP。' : 'Pony v2.5 全功能小马固件：传感器、CCD、运动与控制逻辑。'}</small><ArrowRight size={18} /></button>
      </div>
      <div className="mcu-recent-list"><h2>最近自由练习</h2>{free.length > 0 ? free.map((workspace) => <button type="button" key={workspace.id} onClick={() => onNavigate({ kind: 'workspace', workspaceId: workspace.id })}><Code2 size={17} /><span><strong>{workspace.name}</strong><small>{workspace.templateId.includes('sdk-empty') ? '基础 SDK 空工程' : workspace.templateId.includes('pony') ? '完整小马例程' : '自由练习'} · {formatTime(workspace.updatedAt)}</small></span><ArrowRight size={15} /></button>) : <p>还没有自由练习工程。创建一个工程后，可以随时从这里继续。</p>}</div>
    </section>
  }

  const recentItems = recent.flatMap((activity) => {
    if (activity.kind === 'workspace') {
      const workspace = mcuWorkspaces.find((item) => item.id === activity.workspaceId)
      if (!workspace) return []
      const lab = workspace.workspacePurpose === 'mcu-lesson-attempt'
      return [{ key: `workspace:${workspace.id}`, icon: lab ? FlaskConical : Code2, eyebrow: lab ? '继续实验' : '自由练习', title: workspace.name, detail: formatTime(activity.openedAt), view: { kind: 'workspace', workspaceId: workspace.id } as McuView }]
    }
    const lesson = course?.lessons.find((item) => item.lessonId === activity.lessonId && item.courseId === activity.courseId)
    if (!lesson) return []
    const progress = learning.find((item) => item.courseId === activity.courseId && item.lessonId === activity.lessonId && item.contentVersion === lesson.contentVersion)
    return [{ key: `lesson:${activity.courseId}:${activity.lessonId}`, icon: BookOpenCheck, eyebrow: progress?.completedAt ? '回顾课程' : '继续课程', title: lesson.title, detail: progress ? `${progress.completedSectionIds.length} 节已完成 · ${formatTime(activity.openedAt)}` : formatTime(activity.openedAt), view: { kind: 'lesson', courseId: activity.courseId, lessonId: activity.lessonId } as McuView }]
  }).slice(0, 3)

  return <section className="mcu-home">
    <header className="mcu-home-hero"><div><BrandLogo /><h1>今天想从哪里开始？</h1><p>先理解原理，再走进实验；也可以直接打开自由工作室。</p></div><img className="brand-motif" src={brandMotif} width="180" height="90" alt="" /></header>
    <div className="mcu-path-choices">
      <button type="button" className="is-course" onClick={() => onNavigate({ kind: 'course-center', courseId: course?.courseId })}><span><BookOpenCheck size={25} /></span><small>LEARNING PATH</small><strong>课程学习</strong><p>跟随课程学习知识，再进入配套工程亲自验证。</p><b>进入课程 <ArrowRight size={15} /></b></button>
      <div className="mcu-pcb-bridge" aria-hidden="true"><i /><i /><i /></div>
      <button type="button" className="is-free" onClick={() => onNavigate({ kind: 'home', panel: 'free-practice' })}><span><Code2 size={25} /></span><small>FREE WORKSHOP</small><strong>自由练习</strong><p>选择基础 SDK 空工程或完整小马例程，自由编辑工程文件并编译。</p><b>开始练习 <ArrowRight size={15} /></b></button>
    </div>
    <section className="mcu-home-recent"><header><div><span className="eyebrow">RECENT ACTIVITY</span><h2>最近使用</h2></div><Clock3 size={18} /></header>{recentItems.length > 0 ? <div>{recentItems.map(({ key, icon: Icon, eyebrow, title, detail, view }) => <button type="button" key={key} onClick={() => onNavigate(view)}><Icon size={17} /><span><small>{eyebrow}</small><strong>{title}</strong></span><time>{detail}</time><ArrowRight size={15} /></button>)}</div> : <p>学习和工程记录会显示在这里。先选择上面的一条路径开始。</p>}</section>
  </section>
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}
