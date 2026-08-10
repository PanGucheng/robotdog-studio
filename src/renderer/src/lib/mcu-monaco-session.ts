import type { editor } from 'monaco-editor'

const viewStates = new Map<string, Map<string, editor.ICodeEditorViewState>>()

export function saveMcuEditorViewState(workspaceId: string, path: string, state: editor.ICodeEditorViewState | null): void {
  if (!state) return
  const workspace = viewStates.get(workspaceId) ?? new Map<string, editor.ICodeEditorViewState>()
  workspace.set(path, state)
  viewStates.set(workspaceId, workspace)
}

export function readMcuEditorViewState(workspaceId: string, path: string): editor.ICodeEditorViewState | undefined {
  return viewStates.get(workspaceId)?.get(path)
}

export function clearMcuEditorViewState(workspaceId: string): void { viewStates.delete(workspaceId) }
