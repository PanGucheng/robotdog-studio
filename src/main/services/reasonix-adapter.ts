export type AdapterEvent =
  | { type: 'plan'; sequence: number; steps: Array<{ id: string; label: string }> }
  | { type: 'assistant_delta'; sequence: number; text: string }
  | { type: 'activity'; sequence: number; label: string; state: 'thinking' | 'editing' | 'validating' }
  | { type: 'permission_request'; sequence: number; requestId: string; title: string; kind: 'edit' | 'question'; detail: string; options: Array<{ id: string; label: string; tone: 'approve' | 'reject' | 'neutral' }> }

export interface AdapterTurnContext {
  turnId: string
  workspaceId: string
  candidateId: string
  candidateRoot: string
  message: string
  policyVersion?: string
  readOnly?: boolean
  taskKind?: 'explain_code' | 'explain_diagnostic' | 'modify_code' | 'repair_compile_error' | 'teacher_diagnostic'
}

export interface ReasonixAdapter {
  readonly kind: 'mock' | 'reasonix'
  runTurn(context: AdapterTurnContext, emit: (event: AdapterEvent | unknown) => void, signal: AbortSignal): Promise<{ summary: string }>
  respondPermission?(turnId: string, requestId: string, optionId: string): boolean
}
