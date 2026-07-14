import { describe, expect, it } from 'vitest'
import { toStudentErrorMessage, toStudentProblem } from './student-errors'

describe('toStudentErrorMessage', () => {
  it('explains an inapplicable candidate without exposing the internal code', () => {
    const message = toStudentErrorMessage(new Error('CANDIDATE_NOT_APPLICABLE'))
    expect(message).toContain('修改已经失效')
    expect(message).not.toContain('CANDIDATE_')
  })

  it('keeps an unexpected detail for teacher troubleshooting', () => {
    const problem = toStudentProblem('unexpected failure')
    expect(problem.whatHappened).toBe('系统没有完成刚才的操作。')
    expect(problem.technicalDetail).toBe('unexpected failure')
  })

  it('turns the temporary diff race into a short student message', () => {
    const message = toStudentErrorMessage(new Error("Error invoking remote method 'candidate:get-diff': Error: CANDIDATE_DIFF_NOT_READY"))
    expect(message).toBe('系统正在整理这次修改的前后对比，暂时还不能展示。')
  })

  it('does not describe Git workspace failures as compiler errors', () => {
    const problem = toStudentProblem('WORKSPACE_GIT_FAILED: error: cannot spawn git.exe')
    expect(problem.title).toBe('学生工作区没有准备好')
    expect(problem.whatHappened).not.toContain('编译器')
  })

  it('redacts API-like secrets from technical details', () => {
    const problem = toStudentProblem('request failed api_key=sk-123456789abcdef')
    expect(problem.technicalDetail).toContain('api_key=***')
    expect(problem.technicalDetail).not.toContain('123456789abcdef')
  })
})
