import { describe, expect, it } from 'vitest'
import type { FirmwareUpdateSnapshot, WchLinkFlashSnapshot } from '../../../shared/types'
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
