import { describe, expect, it } from 'vitest'

import { getSafeRedirect, getSignInUrl } from './auth-redirect'

describe('getSafeRedirect', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['projects', '/'],
    ['https://example.com/steal', '/'],
    ['//example.com/steal', '/'],
    ['/\\example.com/steal', '/'],
    ['/owner/repo/main?tab=files#top', '/owner/repo/main?tab=files#top'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(getSafeRedirect(input)).toBe(expected)
  })
})

describe('getSignInUrl', () => {
  it('omits the default destination and encodes other internal paths', () => {
    expect(getSignInUrl('/')).toBe('/sign-in')
    expect(getSignInUrl('/owner/repo?tab=files')).toBe(
      '/sign-in?redirect=%2Fowner%2Frepo%3Ftab%3Dfiles',
    )
  })
})
