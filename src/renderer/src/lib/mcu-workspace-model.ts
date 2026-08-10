import type { CandidateDiagnostic, CandidateSnapshot, FirmwareBuildSnapshot, WorkspaceSummary } from '../../../shared/types'

export type BottomPanelTab = 'problems' | 'build' | 'output'

export interface BottomPanelUiState {
  open: boolean
  tab: BottomPanelTab
  height: number
}

export type BottomPanelAction =
  | { type: 'USER_OPEN'; tab?: BottomPanelTab }
  | { type: 'USER_CLOSE' }
  | { type: 'USER_SELECT_TAB'; tab: BottomPanelTab }
  | { type: 'USER_RESIZE'; height: number; surfaceHeight: number }
  | { type: 'CANDIDATE_FAILED' }
  | { type: 'FIRMWARE_STARTED' }
  | { type: 'FIRMWARE_FAILED' }
  | { type: 'FIRMWARE_COMPLETED' }
  | { type: 'RESTORE'; value: unknown; surfaceHeight: number }

export const DEFAULT_BOTTOM_PANEL: BottomPanelUiState = { open: true, tab: 'problems', height: 240 }

export function maxBottomPanelHeight(surfaceHeight: number): number {
  return Math.max(160, surfaceHeight - 78 - 32 - 220)
}

export function clampBottomPanelHeight(height: number, surfaceHeight: number): number {
  return Math.round(Math.max(160, Math.min(maxBottomPanelHeight(surfaceHeight), Number.isFinite(height) ? height : 240)))
}

export function bottomPanelReducer(state: BottomPanelUiState, action: BottomPanelAction): BottomPanelUiState {
  switch (action.type) {
    case 'USER_OPEN': return { ...state, open: true, tab: action.tab ?? state.tab }
    case 'USER_CLOSE': return { ...state, open: false }
    case 'USER_SELECT_TAB': return { ...state, open: true, tab: action.tab }
    case 'USER_RESIZE': {
      const height = clampBottomPanelHeight(action.height, action.surfaceHeight)
      return height === state.height ? state : { ...state, height }
    }
    case 'CANDIDATE_FAILED': return { ...state, open: true, tab: 'problems' }
    case 'FIRMWARE_STARTED': return { ...state, open: true, tab: 'build' }
    case 'FIRMWARE_FAILED': return { ...state, open: true, tab: 'problems' }
    case 'FIRMWARE_COMPLETED': return { ...state, open: true, tab: 'build' }
    case 'RESTORE': return restoreBottomPanel(action.value, action.surfaceHeight)
  }
}

export function restoreBottomPanel(value: unknown, surfaceHeight: number): BottomPanelUiState {
  if (!isRecord(value) || value.version !== 1 || typeof value.open !== 'boolean' || !isPanelTab(value.tab) || typeof value.height !== 'number') {
    return { ...DEFAULT_BOTTOM_PANEL, height: clampBottomPanelHeight(DEFAULT_BOTTOM_PANEL.height, surfaceHeight) }
  }
  return { open: value.open, tab: value.tab, height: clampBottomPanelHeight(value.height, surfaceHeight) }
}

export interface WorkspaceProblem {
  id: string
  source: 'candidate' | 'firmware' | 'linker' | 'safety'
  severity: 'error' | 'warning'
  message: string
  path?: string
  line?: number
  column?: number
}

export function aggregateWorkspaceProblems(candidate: CandidateSnapshot | undefined, build: FirmwareBuildSnapshot, workspaceId: string): WorkspaceProblem[] {
  const problems: WorkspaceProblem[] = []
  if (candidate?.workspaceId === workspaceId) problems.push(...toProblems(candidate.diagnostics ?? [], 'candidate'))
  if (build.workspaceId === workspaceId) {
    problems.push(...toProblems(build.diagnostics ?? [], 'firmware'))
    if (build.state === 'failed' && problems.every((item) => item.source !== 'firmware') && build.error) {
      problems.push({ id: `firmware:fallback:${build.error}`, source: classifyProblem(build.error), severity: 'error', message: build.error })
    }
  }
  return problems.sort((left, right) => problemRank(left) - problemRank(right))
}

function toProblems(items: CandidateDiagnostic[], source: WorkspaceProblem['source']): WorkspaceProblem[] {
  return items.map((item, index) => ({ ...item, id: `${source}:${item.path ?? 'global'}:${item.line ?? 0}:${index}`, source: item.path ? source : classifyProblem(item.message) }))
}

function classifyProblem(message: string): 'linker' | 'safety' {
  return /undefined reference|linker|collect2/i.test(message) ? 'linker' : 'safety'
}

function problemRank(problem: WorkspaceProblem): number {
  if (problem.source === 'candidate' && problem.severity === 'error') return 0
  if (problem.source === 'firmware' && problem.severity === 'error') return 1
  if (problem.severity === 'warning') return 2
  return 3
}

export function firmwareBelongsToWorkspace(build: FirmwareBuildSnapshot, workspaceId: string): boolean {
  return !build.workspaceId || build.workspaceId === workspaceId
}

export function isFirmwareArtifactCurrent(build: FirmwareBuildSnapshot, workspace: WorkspaceSummary): boolean {
  const proof = build.proof
  return build.state === 'completed' && Boolean(proof && proof.workspaceId === workspace.id && proof.workspaceCommit === workspace.headCommit && proof.firmwareBaselineId === workspace.firmwareBaselineId && proof.baselineCommit === workspace.baselineCommit)
}

export interface Point { x: number; y: number }
export interface Rect { left: number; top: number; width: number; height: number }
export interface FloatingAiPlacement { edge: 'left' | 'right'; yRatio: number }

export function viewportDeltaToLocal(start: Point, current: Point, scale: Point): Point {
  return {
    x: (current.x - start.x) / safeScale(scale.x),
    y: (current.y - start.y) / safeScale(scale.y)
  }
}

export function clampFloatingPoint(point: Point, rect: Rect, buttonSize = 52, margin = 16): Point {
  const minX = rect.left + Math.min(margin, Math.max(0, rect.width - buttonSize))
  const minY = rect.top + Math.min(margin, Math.max(0, rect.height - buttonSize))
  const maxX = Math.max(minX, rect.left + rect.width - buttonSize - margin)
  const maxY = Math.max(minY, rect.top + rect.height - buttonSize - margin)
  return {
    x: clamp(point.x, minX, maxX),
    y: clamp(point.y, minY, maxY)
  }
}

export function snapFloatingPlacement(point: Point, rect: Rect, buttonSize = 52, margin = 16): FloatingAiPlacement {
  const clamped = clampFloatingPoint(point, rect, buttonSize, margin)
  const leftX = rect.left + margin
  const rightX = rect.left + rect.width - buttonSize - margin
  const vertical = Math.max(1, rect.height - buttonSize - margin * 2)
  return { edge: Math.abs(clamped.x - leftX) <= Math.abs(clamped.x - rightX) ? 'left' : 'right', yRatio: clamp((clamped.y - rect.top - margin) / vertical, 0, 1) }
}

export function resolveFloatingPoint(placement: FloatingAiPlacement, rect: Rect, buttonSize = 52, margin = 16): Point {
  const safe = restoreFloatingPlacement(placement)
  return clampFloatingPoint({
    x: safe.edge === 'left' ? rect.left + margin : rect.left + rect.width - buttonSize - margin,
    y: rect.top + margin + Math.max(0, rect.height - buttonSize - margin * 2) * safe.yRatio
  }, rect, buttonSize, margin)
}

export function isPointerDrag(start: Point, current: Point, threshold = 6): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold
}

export function restoreFloatingPlacement(value: unknown): FloatingAiPlacement {
  if (!isRecord(value) || (value.edge !== 'left' && value.edge !== 'right') || typeof value.yRatio !== 'number' || !Number.isFinite(value.yRatio)) return { edge: 'right', yRatio: 1 }
  return { edge: value.edge, yRatio: clamp(value.yRatio, 0, 1) }
}

function isPanelTab(value: unknown): value is BottomPanelTab { return value === 'problems' || value === 'build' || value === 'output' }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
function safeScale(value: number): number { return Number.isFinite(value) && value > 0 ? value : 1 }
