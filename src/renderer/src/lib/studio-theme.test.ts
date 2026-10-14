// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyStudioTheme, currentStudioTheme, readStudioTheme, THEME_EVENT } from './studio-theme'
import { STUDIO_THEME } from '../../../shared/studio-theme'

afterEach(() => { delete window.studioWindowChrome; localStorage.clear(); vi.restoreAllMocks() })
describe('Studio theme preference', () => {
  it('defaults to light and ignores invalid preferences', () => {
    localStorage.setItem('robotdog.theme', 'invalid')
    expect(readStudioTheme()).toBe('light')
  })
  it('restores the native startup preference before the renderer paints', () => {
    window.studioWindowChrome = { customTitleBar: true, height: 36, initialTheme: 'dark', setTheme: vi.fn().mockResolvedValue(undefined) }
    expect(readStudioTheme()).toBe('dark')
  })
  it('switches both directions, persists selection and notifies live editors', () => {
    const changed = vi.fn()
    window.addEventListener(THEME_EVENT, changed)
    applyStudioTheme('dark')
    expect(currentStudioTheme()).toBe('dark')
    expect(readStudioTheme()).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    applyStudioTheme('light')
    expect(document.documentElement.style.getPropertyValue('--surface-navigation')).toBe(STUDIO_THEME['surface-navigation'])
    expect(readStudioTheme()).toBe('light')
    expect(changed).toHaveBeenCalledTimes(2)
    window.removeEventListener(THEME_EVENT, changed)
  })
  it('still switches when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable') })
    expect(() => applyStudioTheme('dark')).not.toThrow()
    expect(currentStudioTheme()).toBe('dark')
  })
})
