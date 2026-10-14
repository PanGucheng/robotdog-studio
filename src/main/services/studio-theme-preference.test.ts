import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readThemePreference, saveThemePreference } from './studio-theme-preference'

const directories: string[] = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }) })
function preference(): string {
  const directory = mkdtempSync(join(tmpdir(), 'studio-theme-test-'))
  directories.push(directory)
  return join(directory, 'theme.json')
}
describe('native theme persistence', () => {
  it('restores a saved theme and falls back for missing or corrupt files', () => {
    const file = preference()
    expect(readThemePreference(file)).toBe('light')
    saveThemePreference(file, 'dark')
    expect(readThemePreference(file)).toBe('dark')
    writeFileSync(file, '{invalid')
    expect(readThemePreference(file)).toBe('light')
    writeFileSync(file, '{"theme":"sepia"}')
    expect(readThemePreference(file)).toBe('light')
  })
  it('rejects arbitrary values without changing a saved selection', () => {
    const file = preference()
    saveThemePreference(file, 'dark')
    expect(() => saveThemePreference(file, { color: '#ffffff' })).toThrow('INVALID_STUDIO_THEME')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ theme: 'dark' })
  })
})
