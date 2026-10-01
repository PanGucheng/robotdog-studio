import { DEFAULT_EDITION_ID, parseEditionId, type EditionId } from '../../shared/edition'
import { APP_UPDATE_URL } from '../../shared/app-update'

export function resolveEditionIdentity(packaged: boolean, envEdition: string | undefined, config: unknown): EditionId {
  if (!packaged && envEdition) return parseEditionId(envEdition)
  if (config && typeof config === 'object' && (config as { schemaVersion?: unknown }).schemaVersion === 1) {
    return parseEditionId((config as { edition?: unknown }).edition)
  }
  if (packaged) throw new Error('ROBOTDOG_EDITION_CONFIG_INVALID')
  return DEFAULT_EDITION_ID
}
export function appUpdateConfiguration(packaged: boolean, platform: string, formal: boolean, env: NodeJS.ProcessEnv): { enabled: boolean; updateUrl: string } {
  const explicit = env.ROBOTDOG_APP_UPDATE_ENABLE === '1'
  return {
    enabled: platform === 'win32' && (explicit || (packaged && formal && env.ROBOTDOG_SMOKE_TEST !== '1')),
    updateUrl: explicit ? env.ROBOTDOG_APP_UPDATE_URL ?? APP_UPDATE_URL : APP_UPDATE_URL
  }
}
