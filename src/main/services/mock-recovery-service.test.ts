import { describe, expect, it } from 'vitest'
import { MockRecoveryService } from './mock-recovery-service'
import { MockRobotService } from './mock-robot-service'

function waitForRecovery(service: MockRecoveryService, state: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`等待 ${state} 超时`)), 2000)
    const listener = (event: { snapshot: { state: string } }): void => {
      if (event.snapshot.state === state) {
        clearTimeout(timeout)
        service.off('event', listener)
        resolve()
      }
    }
    service.on('event', listener)
  })
}

describe('MockRecoveryService', () => {
  it('restores bootloader and app as one guarded operation', async () => {
    const service = new MockRecoveryService(new MockRobotService(), 1)
    service.start()
    await waitForRecovery(service, 'completed')
    expect(service.getSnapshot()).toMatchObject({ state: 'completed', progress: 100, canCancel: false })
  })

  it('only allows cancellation before flash mutation', () => {
    const service = new MockRecoveryService(new MockRobotService(), 10)
    service.start()
    expect(service.cancel()).toMatchObject({ state: 'cancelled' })
  })
})
