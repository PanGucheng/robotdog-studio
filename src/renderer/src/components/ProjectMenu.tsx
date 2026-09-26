import { useEffect, useRef } from 'react'
import { Info } from 'lucide-react'

export interface ProjectMenuProps {
  anchorRef: React.RefObject<HTMLElement | null>
  onClose(): void
  onSelectAbout(): void
}

export function ProjectMenu({ anchorRef, onClose, onSelectAbout }: ProjectMenuProps): React.JSX.Element {
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
    <div ref={menuRef} className="project-menu" role="menu" aria-label="项目菜单">
      <div className="project-menu-header">
        <span className="project-menu-title">RoboHorse Studio</span>
      </div>
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
