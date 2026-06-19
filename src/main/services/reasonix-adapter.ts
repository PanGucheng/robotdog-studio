export type AdapterEvent =
  | { type: 'plan'; sequence: number; steps: Array<{ id: string; label: string }> }
  | { type: 'assistant_delta'; sequence: number; text: string }
  | { type: 'activity'; sequence: number; label: string; state: 'thinking' | 'editing' | 'validating' }

export interface AdapterTurnContext {
  turnId: string
  workspaceId: string
  candidateId: string
  candidateRoot: string
  message: string
}

export interface ReasonixAdapter {
  readonly kind: 'mock' | 'reasonix'
  runTurn(context: AdapterTurnContext, emit: (event: AdapterEvent | unknown) => void, signal: AbortSignal): Promise<{ summary: string }>
}

