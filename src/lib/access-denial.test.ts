import { describe, expect, it } from 'vitest'

import { accessDenialFrom, userFacingError } from './access-denial'

describe('access denial presentation', () => {
  it('recognizes serialized policy errors and safe action URLs', () => {
    expect(
      accessDenialFrom({
        message: 'Access denied: feature_unavailable',
        reason: 'feature_unavailable',
        actionUrl: '/settings',
      }),
    ).toEqual({
      reason: 'feature_unavailable',
      message: 'This feature is not available for this account.',
      actionUrl: '/settings',
    })
  })

  it('recognizes message-only errors after transport serialization', () => {
    expect(
      userFacingError(new Error('Access denied: quota_exceeded'), 'No'),
    ).toBe('The operation limit has been reached.')
  })

  it('rejects unsafe upgrade protocols', () => {
    expect(
      accessDenialFrom({
        reason: 'feature_unavailable',
        actionUrl: 'javascript:alert(1)',
      })?.actionUrl,
    ).toBeUndefined()
  })

  it('does not expose browser transport errors to users', () => {
    expect(
      userFacingError(
        new TypeError('Failed to fetch'),
        'Could not load media.',
      ),
    ).toBe('Could not load media.')
    expect(
      userFacingError(new Error('fetch failed'), 'Could not load media.'),
    ).toBe('Could not load media.')
    expect(
      userFacingError(
        new Error('connect ECONNREFUSED'),
        'Could not load media.',
      ),
    ).toBe('Could not load media.')
  })

  it('does not expose generic server errors to users', () => {
    expect(
      userFacingError(new Error('Internal Server Error'), 'Try again later.'),
    ).toBe('Try again later.')
  })
})
