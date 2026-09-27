import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { FirmwareBaselineService, type FirmwareBaselineServiceOptions } from './firmware-baseline-service'

export interface FirmwareBaselineResolverOptions {
  staticRoot: string
  firmwareBaselinesRoot?: string
  isPackaged: boolean
  appPath?: string
  developmentSourceOverrides?: Record<string, string>
}

export class FirmwareBaselineResolver {
  private readonly services = new Map<string, FirmwareBaselineService>()

  constructor(private readonly options: FirmwareBaselineResolverOptions) {}

  register(baselineId: string, service: FirmwareBaselineService): void {
    this.services.set(baselineId, service)
  }

  resolveForWorkspace(workspace: { firmwareBaselineId: string }): FirmwareBaselineService {
    return this.resolve(workspace.firmwareBaselineId)
  }

  resolve(baselineId: string): FirmwareBaselineService {
    let service = this.services.get(baselineId)
    if (service) return service

    const serviceOptions = this.getServiceOptions(baselineId)
    service = new FirmwareBaselineService(serviceOptions)
    this.services.set(baselineId, service)
    return service
  }

  private getServiceOptions(baselineId: string): FirmwareBaselineServiceOptions {
    const { staticRoot, isPackaged } = this.options
    const baselinesRoot = this.options.firmwareBaselinesRoot ?? join(staticRoot, 'firmware-baselines')

    const createOptions = (baselineDir: string): FirmwareBaselineServiceOptions => {
      const manifestPath = join(baselinesRoot, baselineDir, 'active.json')
      const localCurrentSource = join(baselinesRoot, baselineDir, 'current', 'source')
      const packagedSourceRoot = existsSync(localCurrentSource)
        ? localCurrentSource
        : isPackaged
          ? join(process.resourcesPath, 'firmware-baselines', baselineDir, 'current', 'source')
          : undefined

      return {
        manifestPath,
        packagedSourceRoot,
        developmentSourceRoot: this.options.developmentSourceOverrides?.[baselineId]
      }
    }

    if (baselineId === 'ch32v203-pony-v25' || baselineId.startsWith('ch32v203-pony')) {
      return createOptions('ch32v203-pony')
    }

    if (baselineId === 'ch32v203-rhs-baseline' || baselineId.startsWith('ch32v203-rhs')) {
      return createOptions('ch32v203-rhs')
    }

    if (baselineId === 'ch32v203-robotdog' || baselineId.startsWith('ch32v203-robotdog') || baselineId === 'ch32v203-robotdog-provisional') {
      return createOptions('ch32v203-robotdog')
    }

    if (baselineId === 'ti-mspm0g3507' || baselineId.startsWith('ti-mspm0')) {
      return createOptions('ti-mspm0g3507')
    }

    throw new Error(`UNKNOWN_FIRMWARE_BASELINE: ${baselineId}`)
  }
}
