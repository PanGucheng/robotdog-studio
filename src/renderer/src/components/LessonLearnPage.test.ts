import { describe, expect, it } from 'vitest'
import { getLessonActionAvailability } from './LessonLearnPage'

describe('LessonLearnPage action availability', () => {
  it('keeps reading and lab actions independent', () => {
    expect(getLessonActionAvailability({ progressSaving: true, attemptStarting: false, integrityError: false })).toEqual({
      completeReadingDisabled: true,
      startLabDisabled: false
    })
    expect(getLessonActionAvailability({ progressSaving: false, attemptStarting: true, integrityError: false })).toEqual({
      completeReadingDisabled: false,
      startLabDisabled: true
    })
  })

  it('blocks only reading progress when course resources fail integrity checks', () => {
    expect(getLessonActionAvailability({ progressSaving: false, attemptStarting: false, integrityError: true })).toEqual({
      completeReadingDisabled: true,
      startLabDisabled: false
    })
  })
})
