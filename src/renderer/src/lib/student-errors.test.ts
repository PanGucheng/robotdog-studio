import { describe, expect, it } from 'vitest'
import { toStudentErrorMessage } from './student-errors'

describe('toStudentErrorMessage', () => {
  it('explains an inapplicable candidate without exposing the internal code', () => {
    const message = toStudentErrorMessage(new Error('CANDIDATE_NOT_APPLICABLE'))
    expect(message).toContain('修改已经失效')
    expect(message).not.toContain('CANDIDATE_')
  })

  it('keeps an unexpected detail for teacher troubleshooting', () => {
    expect(toStudentErrorMessage('unexpected failure')).toBe('操作没有完成：unexpected failure')
  })

  it('turns the temporary diff race into a short student message', () => {
    const message = toStudentErrorMessage(new Error("Error invoking remote method 'candidate:get-diff': Error: CANDIDATE_DIFF_NOT_READY"))
    expect(message).toBe('修改内容还在准备中，请稍等片刻。')
  })
})
