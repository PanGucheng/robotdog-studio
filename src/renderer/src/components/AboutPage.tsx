import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import type { AppEditionProfile } from '../../../shared/edition'
import type { CourseUpdateStatus } from '../../../shared/types'
import { getRobotApi } from '../lib/browser-demo-api'
import brandMark from '../../../../resources/brand/robohorse-mark.png'
import brandMotif from '../../../../resources/brand/robohorse-motif.svg'
import avatarPanGucheng from '../../../../resources/brand/developer-avatar.png'
import avatarQiaoPengsen from '../../../../resources/brand/developer-qiaopengsen.jpg'
import avatarChenTingrui from '../../../../resources/brand/developer-chentingrui.jpg'
import avatarYangJie from '../../../../resources/brand/developer-yangjie.jpg'
import avatarYangYiyuan from '../../../../resources/brand/developer-yangyiyuan.jpg'
import packageJson from '../../../../package.json'

const DEVELOPERS = [
  { name: '潘顾诚', role: 'RoboHorse Studio开发', avatar: avatarPanGucheng },
  { name: '乔芃森', role: '下位机软件开发', avatar: avatarQiaoPengsen },
  { name: '陈庭锐', role: 'PCB硬件设计', avatar: avatarChenTingrui },
  { name: '杨杰', role: '机械设计', avatar: avatarYangJie },
  { name: '杨一元', role: '机械设计', avatar: avatarYangYiyuan }
] as const

export interface AboutPageProps {
  edition: AppEditionProfile
  onClose?(): void
}

export function AboutPage({ edition, onClose }: AboutPageProps): React.JSX.Element {
  const appVersion = packageJson.version || '1.0.0'
  const [updateStatus, setUpdateStatus] = useState<CourseUpdateStatus>()
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!onClose) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    try {
      const api = getRobotApi()
      void api.getCourseUpdateStatus?.().then(setUpdateStatus).catch(() => {})
      unsubscribe = api.onCourseUpdate?.((status) => {
        setUpdateStatus(status)
        if (status.kind !== 'checking' && status.kind !== 'downloading') {
          setChecking(false)
        }
      })
    } catch {
      // ignore
    }
    return () => {
      unsubscribe?.()
    }
  }, [])

  const handleCheckUpdate = (): void => {
    setChecking(true)
    const api = getRobotApi()
    void api.checkCourseUpdate?.().then((status) => {
      setUpdateStatus(status)
    }).catch((caught) => {
      setUpdateStatus({
        kind: 'error',
        message: '教学内容更新失败，继续使用当前版本',
        currentVersion: updateStatus?.currentVersion ?? 0,
        error: caught instanceof Error ? caught.message : String(caught)
      })
    }).finally(() => {
      setChecking(false)
    })
  }

  const dialogContent = (
    <div className="about-dialog">
      {onClose && (
        <button
          type="button"
          className="mcu-settings-close"
          onClick={onClose}
          aria-label="关闭关于窗口"
        >
          <X size={18} />
        </button>
      )}
      <main className="about-content">
        <div className="about-brand-section">
          <div className="about-brand-hero">
            <img className="about-brand-motif" src={brandMotif} alt="" aria-hidden="true" />
            <img className="about-brand-mark" src={brandMark} width="56" height="56" alt="RoboHorse Studio" />
            <h1 className="about-brand-title">
              RoboHorse <em>Studio</em>
            </h1>
            <p className="about-brand-tagline">面向机器人与单片机教学的智能实验平台</p>
          </div>
        </div>

        <div className="about-cards">
          <section className="about-card">
            <h2>关于项目</h2>
            <div className="about-card-body">
              <p>
                RoboHorse Studio 是一套面向机器人与单片机教学的桌面实验平台。
              </p>
              <p>
                它将课程学习、代码编写、AI 辅助、程序构建与真实硬件实验整合在同一个学习环境中，让学生能够从理解原理逐步走向实际编程与机器人控制。
              </p>
            </div>
          </section>

          <section className="about-card">
            <h2>开发者</h2>
            <div className="about-card-body">
              <div className="about-developers-grid">
                {DEVELOPERS.map((dev) => (
                  <div key={dev.name} className="about-developer-item">
                    <img
                      className="about-developer-avatar"
                      src={dev.avatar}
                      width="44"
                      height="44"
                      alt={dev.name}
                    />
                    <div className="about-developer-info">
                      <strong className="about-developer-name">{dev.name}</strong>
                      <span className="about-developer-role">{dev.role}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="about-card">
            <h2>当前版本</h2>
            <div className="about-card-body">
              <div className="about-version-list">
                <div className="about-version-item">
                  <span className="about-version-label">当前发行版</span>
                  <div className="about-version-val">
                    <strong>{edition.shortName}</strong>
                    <span className="about-version-sep">·</span>
                    <span>{edition.subtitle}</span>
                  </div>
                </div>
                <div className="about-version-item">
                  <span className="about-version-label">软件版本</span>
                  <div className="about-version-val">
                    <strong>{`RoboHorse Studio v${appVersion}`}</strong>
                  </div>
                </div>
                <div className="about-version-item">
                  <span className="about-version-label">教学内容版本</span>
                  <div className="about-version-val">
                    <strong>
                      {edition.id === 'ti-mspm0-foundations' ? 'TI MSPM0 教学内容 · ' : 'MCU 教学内容 · '}
                      {updateStatus && updateStatus.currentVersion > 0
                        ? `第 ${updateStatus.currentVersion} 版`
                        : '内置内容'}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="about-course-update">
                <button
                  type="button"
                  className="about-course-update-btn"
                  onClick={handleCheckUpdate}
                  disabled={checking}
                >
                  <RefreshCw size={13} className={checking ? 'spin' : ''} />
                  <span>{checking ? '正在检查教学内容更新…' : '检查教学内容更新'}</span>
                </button>
                {updateStatus?.message && (
                  <span className={`about-course-update-status status-${updateStatus.kind}`}>
                    {updateStatus.message}
                  </span>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )

  if (onClose) {
    return (
      <div
        className="mcu-settings-overlay about-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="关于 RoboHorse Studio"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        {dialogContent}
      </div>
    )
  }

  return (
    <div className="about-page">
      {dialogContent}
    </div>
  )
}
