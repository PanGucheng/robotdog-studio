import { describe, expect, it } from 'vitest'
import { calculateTocTrackGeometry, getLessonActionAvailability, resolvePreferredAttemptId, shouldAutoCompleteReadingUnit } from './LessonLearnPage'

describe('LessonLearnPage action availability', () => {
  it('blocks starting another lab only while an attempt is already being created', () => {
    expect(getLessonActionAvailability({ attemptStarting: false })).toEqual({ startLabDisabled: false })
    expect(getLessonActionAvailability({ attemptStarting: true })).toEqual({ startLabDisabled: true })
  })
})

describe('continuous lesson reading progress', () => {
  const base = { unitBottom: 650, viewportTop: 100, viewportHeight: 800, visibleSince: 1_000, now: 1_700, userInteracted: true, suppressed: false }

  it('marks a unit read after its end reaches the reading line and the unit has remained visible', () => {
    expect(shouldAutoCompleteReadingUnit(base)).toBe(true)
  })

  it('does not mark restored, programmatically jumped, briefly visible, or unfinished units', () => {
    expect(shouldAutoCompleteReadingUnit({ ...base, userInteracted: false })).toBe(false)
    expect(shouldAutoCompleteReadingUnit({ ...base, suppressed: true })).toBe(false)
    expect(shouldAutoCompleteReadingUnit({ ...base, now: 1_400 })).toBe(false)
    expect(shouldAutoCompleteReadingUnit({ ...base, unitBottom: 700 })).toBe(false)
    expect(shouldAutoCompleteReadingUnit({ ...base, unitBottom: 90 })).toBe(false)
  })
})

describe('lesson table-of-contents progress track', () => {
  const markers = [
    { sectionId: 'intro', center: 64 },
    { sectionId: 'chip', center: 119 },
    { sectionId: 'led', center: 203 }
  ]

  it('anchors the rail and fill to the actual marker centers', () => {
    expect(calculateTocTrackGeometry(markers, ['intro', 'chip'])).toEqual({ top: 64, height: 139, fillHeight: 55 })
  })

  it('keeps an empty fill at the first marker and follows the furthest completed marker', () => {
    expect(calculateTocTrackGeometry(markers, [])).toEqual({ top: 64, height: 139, fillHeight: 0 })
    expect(calculateTocTrackGeometry(markers, ['led'])).toEqual({ top: 64, height: 139, fillHeight: 139 })
  })
})

describe('resolvePreferredAttemptId', () => {
  const attempts = [
    { id: 'ws-1', name: 'Attempt 1', courseBinding: { attemptNumber: 1 } },
    { id: 'ws-2', name: 'Attempt 2', courseBinding: { attemptNumber: 2 } }
  ] as unknown as import('../../../shared/types').WorkspaceSummary[]

  it('prefers activeWorkspaceId if valid in attempts', () => {
    expect(resolvePreferredAttemptId(attempts, 'ws-2', 'ws-1')).toBe('ws-2')
  })

  it('falls back to savedId if activeWorkspaceId is not matched or omitted', () => {
    expect(resolvePreferredAttemptId(attempts, undefined, 'ws-2')).toBe('ws-2')
    expect(resolvePreferredAttemptId(attempts, 'unknown', 'ws-1')).toBe('ws-1')
  })

  it('auto selects if exactly one attempt exists', () => {
    expect(resolvePreferredAttemptId([attempts[0]], undefined, null)).toBe('ws-1')
  })

  it('returns undefined if multiple attempts exist and neither active nor saved matches', () => {
    expect(resolvePreferredAttemptId(attempts, undefined, null)).toBeUndefined()
    expect(resolvePreferredAttemptId(attempts, 'not-found', 'also-not-found')).toBeUndefined()
  })

  it('returns undefined for empty attempts', () => {
    expect(resolvePreferredAttemptId([], 'ws-1', 'ws-1')).toBeUndefined()
  })
})

