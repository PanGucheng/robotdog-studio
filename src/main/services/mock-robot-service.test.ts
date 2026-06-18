import { describe, expect, it } from 'vitest'
import { MockRobotService } from './mock-robot-service'

describe('MockRobotService', () => {
  it('requires a connection before movement', () => {
    const robot = new MockRobotService()
    expect(() => robot.runAction('walk')).toThrow('请先连接机器马')
  })

  it('rejects commands outside the action allowlist', async () => {
    const robot = new MockRobotService()
    await robot.connectDemo()
    expect(() => robot.runAction('dance')).toThrow('不允许的机器马动作')
  })

  it('produces exactly 128 bounded CCD pixels', async () => {
    const robot = new MockRobotService()
    await robot.connectDemo()
    const frame = robot.captureCcd()
    expect(frame.pixels).toHaveLength(128)
    expect(Math.min(...frame.pixels)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...frame.pixels)).toBeLessThanOrEqual(255)
  })
})
