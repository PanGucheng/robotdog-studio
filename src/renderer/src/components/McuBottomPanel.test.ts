import { describe, expect, it } from 'vitest'
import type { FirmwareBuildSnapshot } from '../../../shared/types'
import { buildTerminalLines, panelStatus } from './McuBottomPanel'

describe('MCU terminal output', () => {
  it('shows a useful terminal message when automatic board detection fails during flashing', () => {
    const lines = buildTerminalLines(['编译完成'], true, {
      state: 'failed',
      logs: ['Error: WCH-Link device not found'],
      error: '没有识别到 WCH-Link，请检查 USB、驱动和烧录器模式。',
      message: '检测失败'
    })

    expect(lines).toContain('— WCH-Link —')
    expect(lines.at(-1)).toBe('烧录失败：没有识别到 WCH-Link，请检查 USB、驱动和烧录器模式。')
  })

  it('reports "另一个项目正在编译" only when another workspace build is actually running', () => {
    const runningBuild: FirmwareBuildSnapshot = {
      state: 'running',
      workspaceId: 'ws_other',
      firmwareRoot: '',
      completedFiles: 1,
      totalFiles: 5,
      logs: [],
      artifacts: []
    }

    // When running in another workspace: shows "另一个项目正在编译"
    expect(panelStatus(runningBuild, false, false, [])).toEqual({
      tone: 'running',
      summary: '另一个项目正在编译'
    })

    // When another workspace build has completed, current workspace is NOT blocked
    const completedOtherBuild: FirmwareBuildSnapshot = {
      ...runningBuild,
      state: 'completed'
    }
    expect(panelStatus(completedOtherBuild, false, false, [])).toEqual({
      tone: 'idle',
      summary: '代码与程序状态'
    })

    // When another workspace build has failed, current workspace is NOT blocked
    const failedOtherBuild: FirmwareBuildSnapshot = {
      ...runningBuild,
      state: 'failed',
      error: '其他项目的错误'
    }
    expect(panelStatus(failedOtherBuild, false, false, [])).toEqual({
      tone: 'idle',
      summary: '代码与程序状态'
    })
  })

  it('correctly reports current workspace build status', () => {
    const currentBuild: FirmwareBuildSnapshot = {
      state: 'running',
      workspaceId: 'ws_this',
      firmwareRoot: '',
      completedFiles: 2,
      totalFiles: 4,
      logs: [],
      artifacts: []
    }

    // Running on this workspace
    expect(panelStatus(currentBuild, true, false, [])).toEqual({
      tone: 'running',
      summary: '正在编译 · 2/4'
    })

    // Completed on this workspace, but code modified since build
    expect(panelStatus({ ...currentBuild, state: 'completed' }, true, false, [])).toEqual({
      tone: 'stale',
      summary: '代码已变化，需要重新编译'
    })

    // Completed on this workspace with matching proof
    expect(panelStatus({ ...currentBuild, state: 'completed', size: { text: 1024, data: 512, bss: 256, dec: 1792, hex: '0x700' } }, true, true, [])).toEqual({
      tone: 'passed',
      summary: '编译完成 · Flash 1.5 KB · RAM 768 B'
    })
  })
})
