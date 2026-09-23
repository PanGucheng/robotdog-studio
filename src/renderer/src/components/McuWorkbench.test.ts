import { describe, expect, it } from 'vitest'
import type { FirmwareBuildSnapshot, FirmwareUpdateSnapshot, WchLinkFlashSnapshot, WorkspaceSummary } from '../../../shared/types'
import { isFirmwareArtifactCurrent, shouldShowProjectTour } from '../lib/mcu-workspace-model'
import { flashNotice } from './McuWorkbench'

const idleUpdate: FirmwareUpdateSnapshot = { state: 'idle', progress: 0, bytesWritten: 0, totalBytes: 0, canCancel: false, message: '等待烧录' }

describe('MCU flash progress notice', () => {
  it('shows board detection failures for the active workspace', () => {
    const wchLink: WchLinkFlashSnapshot = {
      state: 'failed', progress: 100, canCancel: false, logs: [], message: '检测失败',
      error: '没有识别到 WCH-Link，请检查 USB 连接。', artifact: { name: 'RobotDog.hex', kind: 'hex', workspaceId: 'ws_active', stale: false }
    }
    expect(flashNotice('ws_active', true, wchLink, idleUpdate)).toEqual({ title: '未检测到开发板', text: '没有识别到 WCH-Link，请检查 USB 连接。', tone: 'error' })
  })

  it('shows successful flashing in the same progress area', () => {
    const wchLink: WchLinkFlashSnapshot = {
      state: 'completed', progress: 100, canCancel: false, logs: [], message: '写入完成，校验通过。', artifact: { name: 'RobotDog.hex', kind: 'hex', workspaceId: 'ws_active', stale: false }
    }
    expect(flashNotice('ws_active', true, wchLink, idleUpdate)).toEqual({ title: '烧录成功', text: '写入完成，校验通过。', tone: 'success' })
  })
})

describe('MCU sandbox workbench presentation', () => {
  const ponyWorkspace: WorkspaceSummary = {
    id: 'ws_pony',
    name: '小马自由练习',
    studentDisplayName: '小明',
    learningPath: 'mcu-foundations',
    platform: 'wch-ch32v203',
    target: 'CH32V203C8T6',
    toolchainProfile: 'wch-gcc12-openocd',
    workspacePurpose: 'mcu-sandbox',
    templateId: 'ch32v203-pony',
    templateVersion: '0.2.5',
    firmwareBaselineId: 'ch32v203-pony-v25',
    baselineCommit: '797dd6a0a53277197a7c54db2bb4a37debd0a9b0',
    createdAt: '2026-09-23T08:00:00.000Z',
    updatedAt: '2026-09-23T08:00:00.000Z',
    headCommit: 'abcdef0123456789abcdef0123456789abcdef01',
    state: 'ready'
  }

  it('recognizes Pony v2.5 RobotDog artifact when current', () => {
    const build: FirmwareBuildSnapshot = {
      state: 'completed',
      workspaceId: 'ws_pony',
      firmwareRoot: 'firmware/v2.5_沁恒小马例程',
      completedFiles: 29,
      totalFiles: 29,
      logs: [],
      artifacts: [{ name: 'RobotDog.hex', path: 'out/RobotDog.hex', kind: 'hex', bytes: 77709 }],
      proof: {
        schemaVersion: 1,
        inputHash: '1'.repeat(64),
        workspaceId: 'ws_pony',
        workspaceCommit: 'abcdef0123456789abcdef0123456789abcdef01',
        workspaceSourceHash: '2'.repeat(64),
        firmwareBaselineId: 'ch32v203-pony-v25',
        baselineCommit: '797dd6a0a53277197a7c54db2bb4a37debd0a9b0',
        baselineSourceHash: '3'.repeat(64),
        toolchain: 'WCH GCC12',
        board: 'CH32V203C8T6 Pony v2.5',
        size: { text: 17468, data: 236, bss: 4960, dec: 22664, hex: '5888' },
        artifacts: [],
        startedAt: '2026-09-23T08:00:00.000Z',
        completedAt: '2026-09-23T08:00:05.000Z',
        releaseEligible: false
      }
    }
    expect(isFirmwareArtifactCurrent(build, ponyWorkspace)).toBe(true)
  })

  it('does not show the lesson project tour in mcu-sandbox mode', () => {
    expect(shouldShowProjectTour(ponyWorkspace, undefined)).toBe(false)
  })
})
