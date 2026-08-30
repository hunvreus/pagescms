import { describe, expect, it } from 'vitest'

import { accessDenialFrom, userFacingError } from './access-denial'

describe('access denial presentation', () => {
  it('recognizes serialized policy errors and safe upgrade URLs', () => {
    expect(
      accessDenialFrom({
        message: 'Access denied: plan_required',
        reason: 'plan_required',
        upgradeUrl: '/settings/billing',
      }),
    ).toEqual({
      reason: 'plan_required',
      message: 'This action requires a paid plan.',
      upgradeUrl: '/settings/billing',
    })
  })

  it('recognizes message-only errors after transport serialization', () => {
    expect(
      userFacingError(new Error('Access denied: quota_exceeded'), 'No'),
    ).toBe('This plan has reached its usage limit.')
  })

  it('rejects unsafe upgrade protocols', () => {
    expect(
      accessDenialFrom({
        reason: 'plan_required',
        upgradeUrl: 'javascript:alert(1)',
      })?.upgradeUrl,
    ).toBeUndefined()
  })

  it('does not expose browser transport errors to users', () => {
    expect(
      userFacingError(new TypeError('Failed to fetch'), 'Could not load media.'),
    ).toBe('Could not load media.')
    expect(
      userFacingError(new Error('fetch failed'), 'Could not load media.'),
    ).toBe('Could not load media.')
  })
})
