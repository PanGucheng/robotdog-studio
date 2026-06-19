import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ReasonixPermissionPolicy } from './reasonix-permission-policy'

const options = [{ optionId: 'allow_once', kind: 'allow_once' }, { optionId: 'reject_once', kind: 'reject_once' }]

describe('ReasonixPermissionPolicy', () => {
  const root = join('C:', 'managed', 'candidate')
  const policy = new ReasonixPermissionPolicy(root)

  it('allows one candidate-local edit only', () => {
    expect(policy.decide({ toolCall: { kind: 'edit', rawInput: { path: 'student-config/line.yaml' } }, options }))
      .toEqual({ outcome: { outcome: 'selected', optionId: 'allow_once' } })
  })

  it.each([
    { toolCall: { kind: 'execute', rawInput: { command: 'git status' } }, options },
    { toolCall: { kind: 'edit', rawInput: { path: '../outside.txt' } }, options },
    { toolCall: { kind: 'edit', rawInput: { path: '.git/config' } }, options },
    { toolCall: { kind: 'edit', rawInput: { path: 'reasonix.toml' } }, options },
    { toolCall: { kind: 'edit', rawInput: {} }, options }
  ])('denies execution, path escape, git metadata, and ambiguous edits', (request) => {
    expect(policy.decide(request)).toEqual({ outcome: { outcome: 'cancelled' } })
  })
})
