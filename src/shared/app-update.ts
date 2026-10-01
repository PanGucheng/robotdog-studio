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

export const APP_UPDATE_URL = 'https://gitee.com/Cidervinegar/robohorse-studio-releases/raw/main/update.json'
export const APP_RELEASE_REPOSITORY = 'https://gitee.com/Cidervinegar/robohorse-studio-releases'
