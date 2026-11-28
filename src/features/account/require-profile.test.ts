import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { authenticationQueryOptions } from '#/client/queries/session'
import {
  requireConfirmedProfile,
  profileReturnUrl,
  profileSetupHref,
} from './require-profile'

describe('profile confirmation routes', () => {
  it('preserves local entry links and rejects external or looping destinations', () => {
    const entry = '/pagescms/Test/main/file/publications?review=1#title'
    expect(profileSetupHref(entry)).toBe(
      `/onboarding?redirect=${encodeURIComponent(entry)}`,
    )
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/onboarding?redirect=/onboarding',
      '/sign-in',
      '/OnBoarding',
      '/%6Fnboarding',
    ])
      expect(profileReturnUrl(value)).toBe('/')
  })
  it('uses cached authentication and redirects only incomplete accounts', async () => {
    const client = new QueryClient()
    const auth = {
      user: {
        id: 'first',
        name: 'First',
        email: 'first@example.com',
        image: null,
        githubUsername: null,
      },
      profileCompleted: false,
      isAdmin: false,
      methods: { github: true, google: true, email: true },
    }
    client.setQueryData(authenticationQueryOptions().queryKey, auth)
    await expect(
      requireConfirmedProfile(client, '/settings'),
    ).rejects.toMatchObject({
      options: { href: '/onboarding?redirect=%2Fsettings' },
    })
    client.setQueryData(authenticationQueryOptions().queryKey, {
      ...auth,
      profileCompleted: true,
    })
    await expect(
      requireConfirmedProfile(client, '/settings'),
    ).resolves.toBeUndefined()
    client.clear()
  })
})
