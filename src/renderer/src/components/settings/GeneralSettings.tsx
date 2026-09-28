import type { JSX } from 'react'
import { Check } from 'lucide-react'
import { UI_SCALE_OPTIONS, type UiScale } from '../../lib/ui-scale'

export interface GeneralSettingsProps {
  scale: UiScale
  onScaleChange(scale: UiScale): void
}

const scaleCopy: Record<UiScale, string> = {
  100: '适合 1080p 或已开启系统缩放',
  125: '推荐用于 27 英寸 2K 屏幕',
  150: '适合 4K 屏幕或偏大文字',
  175: '最大文字与操作按钮'
}

export function GeneralSettings({ scale, onScaleChange }: GeneralSettingsProps): JSX.Element {
  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h3 className="settings-panel-title">常规</h3>
      </div>

      <section className="settings-section" aria-labelledby="scale-heading">
        <h4 id="scale-heading" className="settings-section-title">界面缩放</h4>
        <p className="settings-section-desc">调整界面文字和控件大小，选择后立即生效并在启动时保留。</p>

        <div className="scale-button-group" role="group" aria-label="选择界面大小">
          {UI_SCALE_OPTIONS.map((option) => {
            const isSelected = option === scale
            return (
              <button
                type="button"
                key={option}
                className={`scale-btn ${isSelected ? 'active' : ''}`}
                aria-pressed={isSelected}
                onClick={() => onScaleChange(option)}
              >
                <span className="scale-btn-label">{option}%</span>
                {isSelected && <Check size={13} className="scale-check-icon" />}
              </button>
            )
          })}
        </div>

        <p className="scale-helper-note">
          当前：<strong>{scale}%</strong> · {scaleCopy[scale]}
        </p>
      </section>
    </div>
  )
}
