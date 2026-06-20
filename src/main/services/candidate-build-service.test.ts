import { describe, expect, it } from 'vitest'
import { validateLineConfigText } from './candidate-build-service'

describe('candidate line configuration preflight', () => {
  it('accepts comments and competition-safe parameter ranges', () => {
    expect(validateLineConfigText('# 让过弯更平稳\nturn_strength: 16\nline_target: 64\n')).toBe('turn_strength=16，line_target=64')
  })

  it.each([
    'turn_strength: 0\nline_target: 64\n',
    'turn_strength: 16\nline_target: 128\n',
    'turn_strength: fast\nline_target: 64\n'
  ])('rejects invalid or unsafe values', (text) => {
    expect(() => validateLineConfigText(text)).toThrow()
  })
})
