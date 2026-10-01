import { IPC_CHANNELS } from '../../shared/channels'

// Some get/list handlers migrate or create persisted records. Track every IPC
// operation rather than inferring filesystem side effects from its name.
export class AppUpdateOperationGate {
  private pending = 0
  constructor(private readonly installing: () => boolean) {}
  isBusy(): boolean { return this.pending > 0 }
  async run<T>(channel: string, operation: () => T | Promise<T>): Promise<T> {
    const flush = channel === IPC_CHANNELS.workspaceFileWrite || channel === IPC_CHANNELS.manualDraftWrite
    if (this.installing() && !flush) throw new Error('APP_UPDATE_INSTALLING')
    this.pending++
    try { return await operation() } finally { this.pending-- }
  }
}
