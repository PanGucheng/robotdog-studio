import { createHash } from 'node:crypto'
import type { FirmwarePackageInspection, FirmwarePackageManifest } from '../../shared/types'
import { crc32 } from '../../shared/iap-protocol'

export interface FirmwarePackagePolicy {
  board: string
  chip: string
  hardwareVersion: string
  appRegionStart: number
  appRegionEnd: number
  maxImageBytes: number
}

export class FirmwarePackageService {
  createManifest(image: Uint8Array, values: Omit<FirmwarePackageManifest, 'magic' | 'formatVersion' | 'imageLength' | 'imageCrc32' | 'imageSha256'>): FirmwarePackageManifest {
    return {
      magic: 'RDSF',
      formatVersion: 1,
      ...values,
      imageLength: image.byteLength,
      imageCrc32: crc32(image),
      imageSha256: sha256(image)
    }
  }

  inspect(image: Uint8Array, manifest: FirmwarePackageManifest, policy: FirmwarePackagePolicy): FirmwarePackageInspection {
    const errors: string[] = []
    const warnings: string[] = []
    if (manifest.magic !== 'RDSF' || manifest.formatVersion !== 1) errors.push('固件包格式不受支持')
    if (manifest.board !== policy.board) errors.push(`板型不匹配：固件为 ${manifest.board}，目标为 ${policy.board}`)
    if (manifest.chip !== policy.chip) errors.push(`芯片不匹配：固件为 ${manifest.chip}，目标为 ${policy.chip}`)
    if (manifest.hardwareVersion !== policy.hardwareVersion && manifest.hardwareVersion !== '*') errors.push('硬件版本不兼容')
    if (manifest.appStart < policy.appRegionStart) errors.push('固件起始地址进入 Bootloader 保护区')
    if (manifest.appStart + manifest.imageLength > policy.appRegionEnd) errors.push('固件超出允许的 APP Flash 区域')
    if (manifest.imageLength > policy.maxImageBytes) errors.push('固件体积超过板卡限制')
    if (manifest.imageLength !== image.byteLength) errors.push('固件长度与清单不一致')
    if (manifest.imageCrc32 !== crc32(image)) errors.push('固件 CRC32 与清单不一致')
    if (manifest.imageSha256.toLowerCase() !== sha256(image)) errors.push('固件 SHA-256 与清单不一致')
    if (!/^RDS1(?:\.|$)/.test(manifest.protocolVersion)) warnings.push('运行态协议版本未声明为 RDS1')
    if (!manifest.firmwareVersion.trim()) warnings.push('固件版本为空，升级后难以确认版本')
    return { valid: errors.length === 0, manifest: { ...manifest }, errors, warnings }
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
