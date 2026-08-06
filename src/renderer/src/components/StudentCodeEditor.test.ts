import { describe, expect, it } from 'vitest'
import type { CandidateSnapshot, StudentCodeFile } from '../../../shared/types'
import { getStudentFileGroups, shouldClearCompilerIssue } from './StudentCodeEditor'

describe('StudentCodeEditor compiler issue lifecycle', () => {
  it('clears stale compiler issue UI after a manual draft is fixed', () => {
    expect(shouldClearCompilerIssue(candidate({ state: 'build_passed', diagnostics: undefined }), 0)).toBe(true)
    expect(shouldClearCompilerIssue(candidate({ state: 'review_ready', diagnostics: undefined }), 0)).toBe(true)
  })

  it('keeps compiler issue UI while diagnostics are still present', () => {
    expect(shouldClearCompilerIssue(candidate({ state: 'review_ready', diagnostics: [{ severity: 'error', message: 'unknown type name int_t' }] }), 1)).toBe(false)
  })

  it('does not clear unrelated AI review candidates', () => {
    expect(shouldClearCompilerIssue({ ...candidate({ state: 'build_passed' }), origin: 'ai' }, 0)).toBe(false)
  })
})

describe('StudentCodeEditor file rail', () => {
  it('renders the groups supplied by the MCU edition instead of legacy fixed groups', () => {
    const files = [
      file('App/Src/experiment.c', '源文件', true),
      file('App/Inc/experiment.h', '头文件', true),
      file('Core/Inc/student_control.h', '只读接口', false),
      file('Core/Src/student_control.c', '只读底层', false)
    ]
    expect(getStudentFileGroups(files)).toEqual(['源文件', '头文件', '只读接口', '只读底层'])
  })
})

function candidate(patch: Partial<CandidateSnapshot> = {}): CandidateSnapshot {
  return {
    id: 'cand_111111111111111111111111',
    workspaceId: 'ws_111111111111111111111111',
    origin: 'manual',
    state: 'review_ready',
    baseCommit: '1'.repeat(40),
    baseTreeHash: '2'.repeat(64),
    policyVersion: 'student-v1:1',
    createdAt: new Date(0).toISOString(),
    expiresAt: new Date(1).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...patch
  }
}

function file(path: string, group: string, editable: boolean): StudentCodeFile {
  return { path, label: path.split('/').at(-1)!, group, language: 'c', editable, content: '' }
}
