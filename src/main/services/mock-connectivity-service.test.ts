import { describe, expect, it } from 'vitest'
import { MockConnectivityService } from './mock-connectivity-service'
import { MockRobotService } from './mock-robot-service'

const binArtifact = { name: 'student.bin', path: 'demo/student.bin', kind: 'bin' as const, bytes: 4096 }

function waitForUpdate(service: MockConnectivityService, expected: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`等待 ${expected} 超时`)), 2000)
    const listener = (event: { snapshot: { state: string } }): void => {
      if (event.snapshot.state === expected) {
        clearTimeout(timeout)
        service.off('update', listener)
        resolve()
      }
    }
    service.on('update', listener)
  })
}

describe('MockConnectivityService', () => {
  it('waits for the wired update port before writing', async () => {
    const service = new MockConnectivityService(new MockRobotService(), 1)
    service.startUpdate(binArtifact)
    await waitForUpdate(service, 'waiting_for_usb')
    expect(service.getUpdate().canCancel).toBe(true)
    expect(service.getConnection().updatePort.state).toBe('disconnected')
  })

  it('completes an update and returns to wireless runtime', async () => {
    const robot = new MockRobotService()
    const service = new MockConnectivityService(robot, 1)
    service.setUsbConnected(true)
    service.startUpdate(binArtifact)
    await waitForUpdate(service, 'completed')
    expect(service.getUpdate().progress).toBe(100)
    expect(service.getConnection().runtime.state).toBe('ready')
    expect(service.getConnection().updatePort.state).toBe('connected')
  })

  it('keeps the bootloader recoverable after a simulated write failure', async () => {
    const service = new MockConnectivityService(new MockRobotService(), 1)
    service.setUsbConnected(true)
    service.setFailureScenario('writing')
    service.startUpdate(binArtifact)
    await waitForUpdate(service, 'failed')
    expect(service.getConnection().updatePort.state).toBe('busy')
    expect(service.getUpdate().error).toContain('Bootloader')
  })
})
