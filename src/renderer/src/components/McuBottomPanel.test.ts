import { describe, expect, it } from 'vitest'
import { buildTerminalLines } from './McuBottomPanel'

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
})
