import { describe, expect, it } from 'vitest'
import type { CandidateSnapshot, CourseLesson, FirmwareBuildSnapshot, WorkspaceSummary } from '../../../shared/types'
import { aggregateWorkspaceProblems, bottomPanelReducer, clampBottomPanelHeight, clampFloatingPoint, DEFAULT_BOTTOM_PANEL, defaultFloatingWindowGeometry, firmwareBelongsToWorkspace, isFirmwareArtifactCurrent, isPointerDrag, moveFloatingWindowGeometry, resizeFloatingWindowGeometry, resolveFloatingPoint, restoreBottomPanel, restoreFloatingPlacement, restoreFloatingWindowGeometry, shouldShowProjectTour, snapFloatingPlacement, viewportDeltaToLocal } from './mcu-workspace-model'

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

  it('shows the project tour only in a matching first-lesson workspace', () => {
    const lesson = { courseId: 'course', lessonId: 'lesson-1', order: 0 } as CourseLesson
    const workspace = { workspacePurpose: 'mcu-lesson-attempt', courseBinding: { courseId: 'course', lessonId: 'lesson-1' } } as WorkspaceSummary
    expect(shouldShowProjectTour(workspace, lesson)).toBe(true)
    expect(shouldShowProjectTour(workspace, { ...lesson, order: 1 })).toBe(false)
    expect(shouldShowProjectTour({ ...workspace, workspacePurpose: 'mcu-sandbox' }, lesson)).toBe(false)
    expect(shouldShowProjectTour(workspace, { ...lesson, lessonId: 'lesson-2' })).toBe(false)
  })

  it('distinguishes click from drag and snaps to safe edges', () => {
    const rect = { left: 0, top: 0, width: 500, height: 400 }
    expect(isPointerDrag({ x: 10, y: 10 }, { x: 15, y: 10 })).toBe(false)
    expect(isPointerDrag({ x: 10, y: 10 }, { x: 16, y: 10 })).toBe(true)
    expect(snapFloatingPlacement({ x: 430, y: 200 }, rect)).toMatchObject({ edge: 'right' })
    expect(resolveFloatingPoint({ edge: 'right', yRatio: 1 }, rect)).toEqual({ x: 432, y: 332 })
    expect(restoreFloatingPlacement({ edge: 'left', yRatio: 5 })).toEqual({ edge: 'left', yRatio: 1 })
  })

  it('converts scaled pointer movement into local workspace coordinates', () => {
    expect(viewportDeltaToLocal({ x: 100, y: 50 }, { x: 135, y: 85 }, { x: 1.75, y: 1.75 })).toEqual({ x: 20, y: 20 })
    expect(viewportDeltaToLocal({ x: 10, y: 10 }, { x: 30, y: 40 }, { x: Number.NaN, y: 0 })).toEqual({ x: 20, y: 30 })
  })

  it('keeps the floating button recoverable in a workspace smaller than its normal margins', () => {
    const tiny = { left: 0, top: 0, width: 60, height: 58 }
    expect(clampFloatingPoint({ x: -100, y: 500 }, tiny)).toEqual({ x: 8, y: 6 })
    expect(resolveFloatingPoint({ edge: 'right', yRatio: 1 }, tiny)).toEqual({ x: 8, y: 6 })
  })

  it('opens the assistant window at a safe default size and position', () => {
    const rect = { left: 0, top: 0, width: 1200, height: 800 }
    expect(defaultFloatingWindowGeometry(rect)).toEqual({ x: 786, y: 24, width: 390, height: 560 })
    expect(restoreFloatingWindowGeometry({ x: Number.NaN, y: 0, width: 10, height: 10 }, rect)).toEqual({ x: 786, y: 24, width: 390, height: 560 })
  })

  it('moves and resizes the assistant window without letting it leave the workspace', () => {
    const rect = { left: 0, top: 0, width: 900, height: 700 }
    const initial = { x: 400, y: 50, width: 390, height: 500 }
    expect(moveFloatingWindowGeometry(initial, { x: -600, y: 900 }, rect)).toMatchObject({ x: 16, y: 184 })
    expect(resizeFloatingWindowGeometry(initial, { x: 900, y: -400 }, rect)).toEqual({ x: 400, y: 50, width: 484, height: 300 })
  })

  it('resizes from every corner while keeping the opposite corner anchored', () => {
    const rect = { left: 0, top: 0, width: 1000, height: 800 }
    const initial = { x: 400, y: 100, width: 390, height: 500 }
    expect(resizeFloatingWindowGeometry(initial, { x: 40, y: 30 }, rect, 'north-west')).toEqual({ x: 440, y: 130, width: 350, height: 470 })
    expect(resizeFloatingWindowGeometry(initial, { x: 40, y: 30 }, rect, 'north-east')).toEqual({ x: 400, y: 130, width: 430, height: 470 })
    expect(resizeFloatingWindowGeometry(initial, { x: 40, y: 30 }, rect, 'south-west')).toEqual({ x: 440, y: 100, width: 350, height: 530 })
    expect(resizeFloatingWindowGeometry(initial, { x: 40, y: 30 }, rect, 'south-east')).toEqual({ x: 400, y: 100, width: 430, height: 530 })
  })
})
