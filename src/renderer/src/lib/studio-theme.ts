import { isStudioThemeMode, studioTheme, type StudioThemeMode } from '../../../shared/studio-theme'

const STORAGE_KEY = 'robotdog.theme'
export const THEME_EVENT = 'studio-theme-changed'

export function readStudioTheme(): StudioThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isStudioThemeMode(stored)) return stored
  } catch { /* Use the native preference if storage is unavailable. */ }
  return isStudioThemeMode(window.studioWindowChrome?.initialTheme) ? window.studioWindowChrome.initialTheme : 'light'
}

export function applyStudioTheme(mode: StudioThemeMode): void {
  const root = document.documentElement
  for (const [name, value] of Object.entries(studioTheme(mode))) root.style.setProperty(`--${name}`, value)
  root.dataset.theme = mode
  root.style.colorScheme = mode
  try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* Theme still works without storage. */ }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: mode }))
  void window.studioWindowChrome?.setTheme?.(mode).catch(error => console.warn('Window theme could not be saved:', error))
}

export function currentStudioTheme(): StudioThemeMode {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}
