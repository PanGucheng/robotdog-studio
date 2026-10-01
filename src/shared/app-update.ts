import type { EditionId } from './edition'

export interface AppUpdateEntry {
  version: string
  url: string
  notes: string
  size: number
  sha256: string
}
export interface AppUpdateManifest {
  schemaVersion: 1
  editions: Partial<Record<EditionId, AppUpdateEntry>>
}
export type AppUpdateKind = 'idle' | 'disabled' | 'checking' | 'not-published' | 'up-to-date' | 'available' | 'downloading' | 'verifying' | 'ready' | 'installing' | 'error'
export interface AppUpdateStatus {
  kind: AppUpdateKind
  editionId: EditionId
  currentVersion: string
  targetVersion?: string
  notes?: string
  downloadedBytes: number
  totalBytes: number
  message: string
  error?: string
}

export const APP_RELEASE_REPOSITORY = 'https://gitcode.com/Cider_Vinegar/robohorse-studio-releases'
export const APP_RELEASE_API_ROOT = 'https://api.gitcode.com/api/v5/repos/Cider_Vinegar/robohorse-studio-releases'
export const APP_UPDATE_URL = `${APP_RELEASE_API_ROOT}/raw/update.json?ref=main`
