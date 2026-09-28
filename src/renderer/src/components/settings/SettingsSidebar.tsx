import type { JSX } from 'react'
import { Cpu, GraduationCap, Sliders, Sparkles } from 'lucide-react'

export type SettingsCategoryId = 'general' | 'ai' | 'courses' | 'advanced'

export interface SettingsCategoryItem {
  id: SettingsCategoryId
  label: string
  icon: typeof Sliders
}

export const SETTINGS_CATEGORIES: SettingsCategoryItem[] = [
  { id: 'general', label: '常规', icon: Sliders },
  { id: 'ai', label: 'AI 助教', icon: Sparkles },
  { id: 'courses', label: '课程与更新', icon: GraduationCap },
  { id: 'advanced', label: '高级', icon: Cpu }
]

export interface SettingsSidebarProps {
  activeId: SettingsCategoryId
  onSelect(id: SettingsCategoryId): void
}

export function SettingsSidebar({ activeId, onSelect }: SettingsSidebarProps): JSX.Element {
  return (
    <nav className="settings-sidebar" aria-label="设置分类">
      {SETTINGS_CATEGORIES.map((cat) => {
        const Icon = cat.icon
        const isActive = cat.id === activeId
        return (
          <button
            type="button"
            key={cat.id}
            className={`settings-nav-item ${isActive ? 'active' : ''}`}
            aria-selected={isActive}
            onClick={() => onSelect(cat.id)}
          >
            <Icon size={15} />
            <span>{cat.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
