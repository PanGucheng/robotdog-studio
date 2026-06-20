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

  it('accepts Reasonix ACP v1 title subjects when rawInput is omitted', () => {
    const request = { toolCall: { kind: 'edit', title: 'edit_file student-config/line-following.yaml' }, options }
    expect(policy.assess(request)).toEqual({ allowed: true, paths: ['student-config/line-following.yaml'] })
    expect(policy.decide(request)).toEqual({ outcome: { outcome: 'selected', optionId: 'allow_once' } })
  })

  it('still rejects title subjects outside the student whitelist', () => {
    expect(policy.assess({ toolCall: { kind: 'edit', title: 'write_file Core/Src/main.c' }, options }).allowed).toBe(false)
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
