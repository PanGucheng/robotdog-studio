import type { JSX } from 'react'
import { RefreshCw } from 'lucide-react'
import type { AppEditionProfile } from '../../../../shared/edition'
import type { CourseUpdateStatus } from '../../../../shared/types'

export interface CourseUpdateSettingsProps {
  editionProfile?: AppEditionProfile
  courseUpdate?: CourseUpdateStatus
  courseChecking: boolean
  onCheckUpdate(): void
}

export function CourseUpdateSettings({
  editionProfile,
  courseUpdate,
  courseChecking,
  onCheckUpdate
}: CourseUpdateSettingsProps): JSX.Element {
  const isUpToDate = courseUpdate?.kind === 'updated' || courseUpdate?.kind === 'up-to-date'
  const isDownloading = courseUpdate?.kind === 'downloading'
  const isError = courseUpdate?.kind === 'error' || courseUpdate?.kind === 'incompatible'

  const statusDotClass = (courseChecking || isDownloading)
    ? 'dot-waiting'
    : isUpToDate
      ? 'dot-ready'
      : isError
        ? 'dot-error'
        : 'dot-neutral'

  const versionLabel =
    (editionProfile?.id === 'ti-mspm0-foundations' ? 'TI MSPM0 教学内容 · ' : 'MCU 教学内容 · ') +
    (courseUpdate?.currentVersion ? `第 ${courseUpdate.currentVersion} 版` : '内置内容')

  const statusMessage = courseChecking
    ? '正在检查教学内容更新…'
    : courseUpdate?.message || '未检查'

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">课程与更新</h3>
      </div>

      <section className="settings-section" aria-labelledby="course-update-heading">
        <h4 id="course-update-heading" className="settings-section-title">教学内容</h4>
        <p className="settings-section-desc">教师发布新的教学内容后，无需升级 RoboHorse Studio 即可更新。</p>

        <div className="settings-rows">
          <div className="settings-row">
            <span className="settings-row-label">教学内容版本</span>
            <span className="settings-row-value">{versionLabel}</span>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">更新状态</span>
            <div className="settings-row-value">
              <span className={`status-dot ${statusDotClass}`} aria-hidden="true" />
              <span>{statusMessage}</span>
            </div>
          </div>
        </div>

        <div className="settings-action-row" style={{ marginTop: '16px' }}>
          <button
            type="button"
            className="settings-btn-primary"
            onClick={onCheckUpdate}
            disabled={courseChecking}
          >
            <RefreshCw size={13} className={courseChecking ? 'spin' : ''} />
            <span>{courseChecking ? '正在检查教学内容更新…' : '检查教学内容更新'}</span>
          </button>
        </div>
      </section>
    </div>
  )
}
