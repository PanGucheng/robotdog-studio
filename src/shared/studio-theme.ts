// The only hand-maintained palette. Renderer, Monaco and native window chrome
// share these values; surface roles are independent of hover/selection states.
const surfaces = {
  page: '#f5f8fa',
  navigation: '#f2f8fb',
  content: '#ffffff',
  hover: '#dceaf0',
  selected: '#dff3f6'
} as const

export const STUDIO_THEME = {
  'surface-page': surfaces.page,
  'surface-navigation': surfaces.navigation,
  'surface-content': surfaces.content,
  'surface-hover': surfaces.hover,
  'surface-selected': surfaces.selected,
  'surface-code': '#f0f5f7',
  'surface-disabled': '#edf1f3',
  'surface-info': '#eaf7f8',
  'surface-success': '#edf9f3',
  'surface-warning': '#fff8e8',
  'surface-danger': '#fff0ee',
  'accent-hover': '#066b7b',
  'accent-pressed': '#055968',
  'selected-ink': '#075f70',
  'focus-ring': '#07788a',
  navy: '#142f46',
  'navy-soft': '#29475b',
  // Compatibility names for existing components, never independent shades.
  canvas: surfaces.page,
  panel: surfaces.content,
  'nav-surface': surfaces.navigation,
  'nav-hover': surfaces.hover,
  sensor: '#00a8c6',
  'pale-cyan': '#73d6e7',
  'sensor-ink': '#07788a',
  amber: '#f3a712',
  green: '#16a36a',
  red: '#d92d20',
  accent: '#07788a',
  'surface-log': '#142f46',
  'surface-message': '#29475b',
  'success-ink': '#08734d',
  'warning-ink': '#80591c',
  'danger-ink': '#a53b32',
  'special-ink': '#804267',
  'success-border': '#b5dfcf',
  'warning-border': '#e2ca99',
  'danger-border': '#e2c2bd',
  muted: '#526b7a',
  line: '#d8e3ea'
} as const

export type StudioThemeMode = 'light' | 'dark'
export function isStudioThemeMode(value: unknown): value is StudioThemeMode {
  return value === 'light' || value === 'dark'
}

export const STUDIO_DARK_THEME: Record<keyof typeof STUDIO_THEME, string> = {
  ...STUDIO_THEME,
  'surface-page': '#141c24', canvas: '#141c24',
  'surface-navigation': '#1a2631', 'nav-surface': '#1a2631',
  'surface-content': '#202d38', panel: '#202d38',
  'surface-hover': '#2e4351', 'nav-hover': '#2e4351',
  'surface-selected': '#164956', 'selected-ink': '#94e2eb',
  'surface-code': '#18242e', 'surface-disabled': '#293640',
  'surface-info': '#173b46', 'surface-success': '#193c31',
  'surface-warning': '#413321', 'surface-danger': '#432b2c',
  navy: '#e2edf4', 'navy-soft': '#c0d1dd', muted: '#a6bbc9',
  'sensor-ink': '#72d5e2', 'focus-ring': '#72d5e2',
  accent: '#08788a', 'accent-hover': '#086779', 'accent-pressed': '#075766',
  'surface-log': '#111b24', 'surface-message': '#294958',
  'success-ink': '#85d9ad', 'warning-ink': '#f1ca82',
  'danger-ink': '#ffaaa2', 'special-ink': '#deb2d2',
  'success-border': '#37765b', 'warning-border': '#856437', 'danger-border': '#925450',
  line: '#3b4d5c'
}

export function studioTheme(mode: StudioThemeMode): Record<keyof typeof STUDIO_THEME, string> {
  return mode === 'dark' ? STUDIO_DARK_THEME : STUDIO_THEME
}
