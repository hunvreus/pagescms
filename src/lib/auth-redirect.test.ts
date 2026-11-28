import { describe, expect, it } from 'vitest'

import { getSafeRedirect, getSignInUrl } from './auth-redirect'

describe('getSafeRedirect', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['projects', '/'],
    ['/_serverFn/anything?payload=untrusted', '/'],
    ['/%5fserverFn/anything', '/'],
    ['/_serverFn%2fanything', '/'],
    ['https://example.com/steal', '/'],
    ['//example.com/steal', '/'],
    ['/.//example.com/steal', '/'],
    ['/x/..//example.com/steal', '/'],
    ['/\\example.com/steal', '/'],
    [
      '/github/owner/repo/main?tab=files#top',
      '/github/owner/repo/main?tab=files#top',
    ],
  ])('normalizes %s to %s', (input, expected) => {
    expect(getSafeRedirect(input)).toBe(expected)
  })
})

describe('getSignInUrl', () => {
  it('omits the default destination and encodes other internal paths', () => {
    expect(getSignInUrl('/')).toBe('/sign-in')
    expect(getSignInUrl('/github/owner/repo?tab=files')).toBe(
      '/sign-in?redirect=%2Fgithub%2Fowner%2Frepo%3Ftab%3Dfiles',
    )
  })
})
