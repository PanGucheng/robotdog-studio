import { describe, expect, it } from 'vitest'
import { hardwarePublicationAllowed } from './course-publication'

describe('hardware course publication', () => {
  it('continues to reject unverified lessons without explicit approval', () => {
    expect(hardwarePublicationAllowed({ verification: 'pending-hardware-check' })).toBe(false)
    expect(hardwarePublicationAllowed({ verification: 'not-required' })).toBe(false)
    expect(hardwarePublicationAllowed({ verification: 'author-approved' })).toBe(false)
    expect(hardwarePublicationAllowed({ verification: 'author-approved', releaseApproval: { date: '2026-10-14', reason: 'release' } })).toBe(false)
  })
  it('keeps author approval distinct from actual hardware verification', () => {
    expect(hardwarePublicationAllowed({ verification: 'hardware-checked' })).toBe(true)
    expect(hardwarePublicationAllowed({ verification: 'author-approved', releaseApproval: { source: 'explicit-user-approval', date: '2026-10-14', reason: 'Owner explicitly waived this hardware acceptance run.' } })).toBe(true)
  })
})
