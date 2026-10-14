import { readFileSync, writeFileSync } from 'node:fs'
import { isStudioThemeMode, type StudioThemeMode } from '../../shared/studio-theme'

export function readThemePreference(path: string): StudioThemeMode {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf8')).theme
    return isStudioThemeMode(value) ? value : 'light'
  } catch { return 'light' }
}

export function saveThemePreference(path: string, mode: unknown): void {
  if (!isStudioThemeMode(mode)) throw new Error('INVALID_STUDIO_THEME')
  writeFileSync(path, JSON.stringify({ theme: mode }), { encoding: 'utf8' })
}
