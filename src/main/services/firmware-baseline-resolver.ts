import { join } from 'node:path'
import { FirmwareBaselineService, type FirmwareBaselineServiceOptions } from './firmware-baseline-service'

export interface FirmwareBaselineResolverOptions {
  staticRoot: string
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

    if (baselineId === 'ch32v203-pony-v25' || baselineId.startsWith('ch32v203-pony')) {
      const baselineDir = 'ch32v203-pony'
      const manifestPath = join(staticRoot, 'firmware-baselines', baselineDir, 'active.json')
      return {
        manifestPath,
        packagedSourceRoot: isPackaged ? join(process.resourcesPath, 'firmware-baselines', baselineDir, 'current', 'source') : undefined,
        developmentSourceRoot: this.options.developmentSourceOverrides?.[baselineId]
      }
    }

    if (baselineId === 'ch32v203-rhs-baseline' || baselineId.startsWith('ch32v203-rhs')) {
      const baselineDir = 'ch32v203-rhs'
      const manifestPath = join(staticRoot, 'firmware-baselines', baselineDir, 'active.json')
      return {
        manifestPath,
        packagedSourceRoot: isPackaged ? join(process.resourcesPath, 'firmware-baselines', baselineDir, 'current', 'source') : undefined,
        developmentSourceRoot: this.options.developmentSourceOverrides?.[baselineId]
      }
    }

    if (baselineId === 'ch32v203-robotdog' || baselineId.startsWith('ch32v203-robotdog') || baselineId === 'ch32v203-robotdog-provisional') {
      const baselineDir = 'ch32v203-robotdog'
      const manifestPath = join(staticRoot, 'firmware-baselines', baselineDir, 'active.json')
      return {
        manifestPath,
        packagedSourceRoot: isPackaged ? join(process.resourcesPath, 'firmware-baselines', baselineDir, 'current', 'source') : undefined,
        developmentSourceRoot: this.options.developmentSourceOverrides?.[baselineId]
      }
    }

    if (baselineId === 'ti-mspm0g3507' || baselineId.startsWith('ti-mspm0')) {
      const baselineDir = 'ti-mspm0g3507'
      const manifestPath = join(staticRoot, 'firmware-baselines', baselineDir, 'active.json')
      return {
        manifestPath,
        packagedSourceRoot: isPackaged ? join(process.resourcesPath, 'firmware-baselines', baselineDir, 'current', 'source') : undefined,
        developmentSourceRoot: this.options.developmentSourceOverrides?.[baselineId]
      }
    }

    throw new Error(`UNKNOWN_FIRMWARE_BASELINE: ${baselineId}`)
  }
}
