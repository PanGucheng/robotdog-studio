import { describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/channels'
import { AppUpdateOperationGate } from './app-update-operation-gate'

describe('update shutdown operation gate', () => {
  it('waits for read-named handlers that can persist or migrate user records', async () => {
    const gate = new AppUpdateOperationGate(() => false)
    let complete!: () => void
    const task = gate.run(IPC_CHANNELS.lessonLearningProgressGet, () => new Promise<void>(resolve => { complete = resolve }))
    expect(gate.isBusy()).toBe(true)
    complete(); await task
    expect(gate.isBusy()).toBe(false)
  })
  it('refuses new reads and tasks during installation while permitting acknowledged saves', async () => {
    const gate = new AppUpdateOperationGate(() => true)
    const operation = vi.fn()
    for (const channel of [IPC_CHANNELS.courseProgressGet, IPC_CHANNELS.workspaceGet, IPC_CHANNELS.agentPrompt, IPC_CHANNELS.firmwareBuildStart]) {
      await expect(gate.run(channel, operation)).rejects.toThrow('APP_UPDATE_INSTALLING')
    }
    expect(operation).not.toHaveBeenCalled()
    await gate.run(IPC_CHANNELS.workspaceFileWrite, operation)
    await gate.run(IPC_CHANNELS.manualDraftWrite, operation)
    expect(operation).toHaveBeenCalledTimes(2)
    expect(gate.isBusy()).toBe(false)
  })
  it('releases the counter after failed IO so a retry is possible', async () => {
    const gate = new AppUpdateOperationGate(() => false)
    await expect(gate.run(IPC_CHANNELS.workspaceFileWrite, () => { throw new Error('DISK_FULL') })).rejects.toThrow()
    expect(gate.isBusy()).toBe(false)
  })
})
