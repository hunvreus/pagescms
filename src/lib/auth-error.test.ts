import { describe, expect, it } from 'vitest'

import { getAuthenticationErrorMessage } from './auth-error'

describe('getAuthenticationErrorMessage', () => {
  it('turns internal error codes into safe user-facing copy', () => {
    expect(getAuthenticationErrorMessage('internal_server_error')).toBe(
      'Sign-in could not be completed. Please try again in a moment.',
    )
  })

  it('explains when an OAuth provider did not confirm a verified email', () => {
    expect(getAuthenticationErrorMessage('email_not_verified')).toBe(
      'Your sign-in provider did not confirm a verified email address. Verify your email with that provider and try again.',
    )
  })

  it('does not expose unknown error codes', () => {
    expect(getAuthenticationErrorMessage('database_connection_failed')).toBe(
      'Sign-in could not be completed.',
    )
  })
})
