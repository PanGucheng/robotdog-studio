import { describe, expect, it } from 'vitest'
import type { CandidateSnapshot, ProjectExplorerNode, StudentCodeFile } from '../../../shared/types'
import { getStudentFileGroups, isActiveAiCandidate, MCU_AUTO_SAVE_DELAY_MS, shouldClearCompilerIssue, withExpandedAncestors } from './StudentCodeEditor'

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

describe('StudentCodeEditor AI candidate lock', () => {
  it('locks editing only while an AI candidate still needs a decision', () => {
    expect(isActiveAiCandidate({ ...candidate({ state: 'build_passed' }), origin: 'ai' })).toBe(true)
    expect(isActiveAiCandidate({ ...candidate({ state: 'failed' }), origin: 'ai' })).toBe(true)
  })

  it.each(['applied', 'rejected', 'cancelled', 'stale'] as const)('does not lock editing for a %s AI candidate', (state) => {
    expect(isActiveAiCandidate({ ...candidate({ state }), origin: 'ai' })).toBe(false)
  })
})

describe('StudentCodeEditor save cadence', () => {
  it('keeps explicit save responsive while spacing out fallback auto-saves', () => {
    expect(MCU_AUTO_SAVE_DELAY_MS).toBeGreaterThanOrEqual(8_000)
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

  it('expands every parent directory when a file is opened programmatically', () => {
    const nodes = [
      explorerNode('app', 'App', undefined, 'directory'),
      explorerNode('src', 'App/Src', 'app', 'directory'),
      explorerNode('experiment', 'App/Src/experiment.c', 'src', 'file')
    ]
    const expanded = withExpandedAncestors(new Set(['another-open-folder']), nodes, nodes[2])
    expect([...expanded]).toEqual(['another-open-folder', 'src', 'app'])
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

function explorerNode(id: string, displayPath: string, parentId: string | undefined, kind: ProjectExplorerNode['kind']): ProjectExplorerNode {
  return {
    id,
    parentId,
    kind,
    name: displayPath.split('/').at(-1)!,
    displayPath,
    access: 'read-only',
    origin: 'firmware-baseline',
    role: 'application',
    state: 'normal'
  }
}
