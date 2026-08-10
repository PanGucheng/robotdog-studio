import { describe, expect, it } from 'vitest'
import type { CandidateSnapshot, FirmwareBuildSnapshot, WorkspaceSummary } from '../../../shared/types'
import { aggregateWorkspaceProblems, bottomPanelReducer, clampBottomPanelHeight, DEFAULT_BOTTOM_PANEL, firmwareBelongsToWorkspace, isFirmwareArtifactCurrent, isPointerDrag, resolveFloatingPoint, restoreBottomPanel, restoreFloatingPlacement, snapFloatingPlacement } from './mcu-workspace-model'

const build = (overrides: Partial<FirmwareBuildSnapshot> = {}): FirmwareBuildSnapshot => ({ state: 'idle', firmwareRoot: '', completedFiles: 0, totalFiles: 0, logs: [], artifacts: [], ...overrides })

describe('MCU workspace model', () => {
  it('routes trusted events to the expected panel tab', () => {
    expect(bottomPanelReducer(DEFAULT_BOTTOM_PANEL, { type: 'CANDIDATE_FAILED' })).toMatchObject({ open: true, tab: 'problems' })
    expect(bottomPanelReducer(DEFAULT_BOTTOM_PANEL, { type: 'FIRMWARE_STARTED' })).toMatchObject({ open: true, tab: 'build' })
    expect(bottomPanelReducer(DEFAULT_BOTTOM_PANEL, { type: 'FIRMWARE_FAILED' })).toMatchObject({ open: true, tab: 'problems' })
    expect(bottomPanelReducer({ ...DEFAULT_BOTTOM_PANEL, open: false }, { type: 'FIRMWARE_COMPLETED' })).toMatchObject({ open: true, tab: 'build' })
  })

  it('restores only versioned valid state and clamps its height', () => {
    expect(restoreBottomPanel({ version: 2, open: false, tab: 'output', height: 999 }, 700)).toEqual({ ...DEFAULT_BOTTOM_PANEL, height: 240 })
    expect(restoreBottomPanel({ version: 1, open: false, tab: 'output', height: 999 }, 700)).toEqual({ open: false, tab: 'output', height: 370 })
    expect(clampBottomPanelHeight(20, 700)).toBe(160)
  })

  it('aggregates only current workspace diagnostics in teaching order', () => {
    const candidate = { workspaceId: 'w1', diagnostics: [{ severity: 'warning', message: 'warn', path: 'a.c' }, { severity: 'error', message: 'bad', path: 'b.c' }] } as CandidateSnapshot
    const result = aggregateWorkspaceProblems(candidate, build({ workspaceId: 'w1', state: 'failed', diagnostics: [{ severity: 'error', message: 'undefined reference to x' }] }), 'w1')
    expect(result.map((item) => item.source)).toEqual(['candidate', 'candidate', 'linker'])
    expect(aggregateWorkspaceProblems(candidate, build({ workspaceId: 'other', error: 'hidden' }), 'w1')).toHaveLength(2)
  })

  it('checks workspace and four-part firmware proof identity', () => {
    const workspace = { id: 'w1', headCommit: 'head', firmwareBaselineId: 'base', baselineCommit: 'baseline' } as WorkspaceSummary
    const current = build({ state: 'completed', workspaceId: 'w1', proof: { workspaceId: 'w1', workspaceCommit: 'head', firmwareBaselineId: 'base', baselineCommit: 'baseline' } as FirmwareBuildSnapshot['proof'] })
    expect(firmwareBelongsToWorkspace(current, 'w1')).toBe(true)
    expect(firmwareBelongsToWorkspace({ ...current, workspaceId: 'w2' }, 'w1')).toBe(false)
    expect(isFirmwareArtifactCurrent(current, workspace)).toBe(true)
    expect(isFirmwareArtifactCurrent({ ...current, proof: { ...current.proof!, workspaceCommit: 'old' } }, workspace)).toBe(false)
  })

  it('distinguishes click from drag and snaps to safe edges', () => {
    const rect = { left: 0, top: 0, width: 500, height: 400 }
    expect(isPointerDrag({ x: 10, y: 10 }, { x: 15, y: 10 })).toBe(false)
    expect(isPointerDrag({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(true)
    expect(snapFloatingPlacement({ x: 430, y: 200 }, rect)).toMatchObject({ edge: 'right' })
    expect(resolveFloatingPoint({ edge: 'right', yRatio: 1 }, rect)).toEqual({ x: 432, y: 332 })
    expect(restoreFloatingPlacement({ edge: 'left', yRatio: 5 })).toEqual({ edge: 'left', yRatio: 1 })
  })
})
