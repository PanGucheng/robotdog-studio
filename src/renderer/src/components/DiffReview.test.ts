import { describe, expect, it } from 'vitest'
import type { CandidateDiffFile } from '../../../shared/types'
import { buildDiffRows } from './DiffReview'

describe('DiffReview line model', () => {
  it('keeps stable line numbers around additions and removals', () => {
    const file: CandidateDiffFile = {
      path: 'student-config/line-following.yaml', status: 'modified', additions: 2, deletions: 1,
      before: 'turn_strength: 18\nline_target: 64\n',
      after: '# 减少过弯摆动\nturn_strength: 16\nline_target: 64\n'
    }
    expect(buildDiffRows(file)).toEqual([
      { kind: 'removed', beforeNumber: 1, text: 'turn_strength: 18' },
      { kind: 'added', afterNumber: 1, text: '# 减少过弯摆动' },
      { kind: 'added', afterNumber: 2, text: 'turn_strength: 16' },
      { kind: 'same', beforeNumber: 2, afterNumber: 3, text: 'line_target: 64' }
    ])
  })
})
