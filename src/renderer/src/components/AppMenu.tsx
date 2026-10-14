import { useEffect, useRef } from 'react'
import { HelpCircle, Info, Moon, Settings2, Sun } from 'lucide-react'
import type { StudioThemeMode } from '../../../shared/studio-theme'

export interface AppMenuProps {
  themeMode: StudioThemeMode
  onToggleTheme(): void
  anchorRef: React.RefObject<HTMLElement | null>
  onClose(): void
  onOpenSettings(): void
  onSelectAbout(): void
  onOpenLearning?: () => void
}

export function AppMenu({ themeMode, onToggleTheme, anchorRef, onClose, onOpenSettings, onSelectAbout, onOpenLearning }: AppMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        (!anchorRef.current || !anchorRef.current.contains(target))
      ) {
        onClose()
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [anchorRef, onClose])

  return (
    <div ref={menuRef} className="project-menu" role="menu" aria-label="应用菜单">
      <div className="project-menu-header">
        <span className="project-menu-title">RoboHorse Studio</span>
      </div>
      <div className="project-menu-divider" role="separator" />
      <button type="button" role="menuitemcheckbox" aria-checked={themeMode === 'dark'}
        className="project-menu-item project-menu-theme" onClick={onToggleTheme}>
        {themeMode === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
        <span>深色模式</span>
        <span className="theme-switch" aria-hidden="true"><i /></span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="project-menu-item"
        onClick={() => {
          onOpenSettings()
        }}
      >
        <Settings2 size={15} />
        <span>设置</span>
      </button>
      {onOpenLearning && (
        <button
          type="button"
          role="menuitem"
          className="project-menu-item"
          onClick={() => {
            onOpenLearning()
          }}
        >
          <HelpCircle size={15} />
          <span>操作示范</span>
        </button>
      )}
      <div className="project-menu-divider" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="project-menu-item"
        onClick={() => {
          onSelectAbout()
        }}
      >
        <Info size={15} />
        <span>关于 RoboHorse Studio</span>
      </button>
    </div>
  )
}
