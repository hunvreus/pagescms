import { describe, expect, it } from 'vitest'
import { collaboratorStatus } from './collaborator-status'

describe('collaborator invitation status', () => {
  const now = Date.parse('2026-10-21T00:00:00Z')
  it('distinguishes active memberships, live invitations and expired links', () => {
    expect(collaboratorStatus(true, new Date(now - 1), now)).toBe('Active')
    expect(collaboratorStatus(false, new Date(now + 1), now)).toBe(
      'Invitation pending',
    )
    expect(collaboratorStatus(false, new Date(now), now)).toBe(
      'Invitation expired',
    )
    expect(
      collaboratorStatus(false, new Date(now - 1).toISOString(), now),
    ).toBe('Invitation expired')
    expect(collaboratorStatus(false, null, now)).toBe('Invitation pending')
  })
})
