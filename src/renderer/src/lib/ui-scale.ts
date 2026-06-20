export const UI_SCALE_OPTIONS = [100, 125, 150, 175] as const
export type UiScale = (typeof UI_SCALE_OPTIONS)[number]

const STORAGE_KEY = 'robotdog.ui-scale'

export function recommendedUiScale(screenWidth: number, devicePixelRatio: number): UiScale {
  if (devicePixelRatio > 1.1) return 100
  if (screenWidth >= 3400) return 150
  if (screenWidth >= 2400) return 125
  return 100
}

export function readUiScale(): UiScale {
  const stored = Number(globalThis.localStorage?.getItem(STORAGE_KEY))
  if (UI_SCALE_OPTIONS.includes(stored as UiScale)) return stored as UiScale
  return recommendedUiScale(globalThis.screen?.width ?? 1440, globalThis.devicePixelRatio ?? 1)
}

export function applyUiScale(scale: UiScale): void {
  globalThis.localStorage?.setItem(STORAGE_KEY, String(scale))
  document.documentElement.dataset.uiScale = String(scale)
  document.documentElement.style.setProperty('--ui-scale', String(scale / 100))
}
