import { ArrowLeft } from 'lucide-react'
import type { AppEditionProfile } from '../../../shared/edition'
import brandMark from '../../../../resources/brand/robohorse-mark.png'
import brandMotif from '../../../../resources/brand/robohorse-motif.svg'
import packageJson from '../../../../package.json'

export interface AboutPageProps {
  edition: AppEditionProfile
  onBack(): void
}

export function AboutPage({ edition, onBack }: AboutPageProps): React.JSX.Element {
  const appVersion = packageJson.version || '0.1.0'

  return (
    <div className="about-page">
      <header className="about-header">
        <button
          type="button"
          className="about-back-button"
          onClick={onBack}
          aria-label="返回"
        >
          <ArrowLeft size={16} />
          <span>返回</span>
        </button>
      </header>

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
              <div className="about-developer-item">
                <strong className="about-developer-name">PanGucheng</strong>
                <span className="about-developer-role">项目设计与开发</span>
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
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
