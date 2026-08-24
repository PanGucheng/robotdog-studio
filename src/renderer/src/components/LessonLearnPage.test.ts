import { describe, expect, it } from 'vitest'
import { getLessonActionAvailability, shouldAutoCompleteReadingUnit } from './LessonLearnPage'

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
