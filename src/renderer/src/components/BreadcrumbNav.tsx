import type { JSX } from 'react'

export interface BreadcrumbItem {
  key: string
  label: string
  onClick?(): void
  title?: string
  current?: boolean
  level?: 'root' | 'parent' | 'current' | 'child'
}

export interface BreadcrumbNavProps {
  items: BreadcrumbItem[]
}

export function BreadcrumbNav({ items }: BreadcrumbNavProps): JSX.Element {
  const hasExplicitCurrent = items.some((item) => item.current)
  return (
    <nav className="breadcrumb-nav" aria-label="页面位置导航">
      <ol className="breadcrumb-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const isCurrent = Boolean(item.current || (!hasExplicitCurrent && isLast))
          const isInteractive = Boolean(item.onClick && !isCurrent)
          const levelClass = item.level
            ? `breadcrumb-level-${item.level}`
            : isCurrent
              ? 'breadcrumb-level-current'
              : ''
          return (
            <li
              key={item.key}
              className={`breadcrumb-item ${levelClass} ${isCurrent ? 'is-current' : ''}`}
            >
              {isInteractive ? (
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={item.onClick}
                  title={item.title ?? item.label}
                >
                  <span className="breadcrumb-text">{item.label}</span>
                </button>
              ) : (
                <span
                  className="breadcrumb-text is-current"
                  aria-current={isCurrent ? 'page' : undefined}
                  title={item.title ?? item.label}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
