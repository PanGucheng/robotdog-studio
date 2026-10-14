// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { AppMenu } from './AppMenu'

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

it('keeps the theme switch accessible and the menu open for immediate comparison', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const props = { anchorRef: { current: container }, onClose: vi.fn(), onOpenSettings: vi.fn(), onSelectAbout: vi.fn(), onToggleTheme: vi.fn() }
  try {
    await act(async () => { root.render(createElement(AppMenu, { ...props, themeMode: 'light' })) })
    const toggle = container.querySelector<HTMLButtonElement>('[role=menuitemcheckbox]')!
    expect(toggle.textContent).toContain('深色模式')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await act(async () => toggle.click())
    expect(props.onToggleTheme).toHaveBeenCalledOnce()
    expect(props.onClose).not.toHaveBeenCalled()
    await act(async () => { root.render(createElement(AppMenu, { ...props, themeMode: 'dark' })) })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
