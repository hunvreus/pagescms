import { describe, expect, it } from 'vitest'

import { getAuthenticationErrorMessage } from './auth-error'

describe('getAuthenticationErrorMessage', () => {
  it('turns internal error codes into safe user-facing copy', () => {
    expect(getAuthenticationErrorMessage('internal_server_error')).toBe(
      'Sign-in could not be completed. Please try again in a moment.',
    )
  })

  it('does not expose unknown error codes', () => {
    expect(getAuthenticationErrorMessage('database_connection_failed')).toBe(
      'Sign-in could not be completed.',
    )
  })
})
