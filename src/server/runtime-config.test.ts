import { describe, expect, it } from 'vitest'

import { parseRuntimeConfiguration } from './runtime-config.server'

describe('parseRuntimeConfiguration', () => {
  const base = {
    BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
    BETTER_AUTH_URL: 'https://app.pagescms.org',
    HYPERDRIVE: {
      connectionString: 'postgres://hyperdrive.internal/pagescms',
    },
  }

  it('prefers Hyperdrive and defaults ordinary deployments to self-hosted', () => {
    expect(parseRuntimeConfiguration(base)).toEqual({
      auth: {
        baseUrl: 'https://app.pagescms.org',
        secret: base.BETTER_AUTH_SECRET,
      },
      databaseConnectionString: 'postgres://hyperdrive.internal/pagescms',
      deployment: 'self-hosted',
    })
  })

  it('accepts paired GitHub OAuth credentials and hosted mode', () => {
    expect(
      parseRuntimeConfiguration({
        ...base,
        DEPLOYMENT_MODE: 'hosted',
        GITHUB_APP_CLIENT_ID: 'client-id',
        GITHUB_APP_CLIENT_SECRET: 'client-secret',
      }),
    ).toMatchObject({
      deployment: 'hosted',
      auth: {
        github: { clientId: 'client-id', clientSecret: 'client-secret' },
      },
    })
  })

  it('allows a direct database secret for non-Cloudflare local runtimes', () => {
    expect(
      parseRuntimeConfiguration({
        ...base,
        HYPERDRIVE: undefined,
        DATABASE_URL: 'postgres://localhost/pagescms',
      }).databaseConnectionString,
    ).toBe('postgres://localhost/pagescms')
  })

  it('accepts complete GitHub App server credentials', () => {
    const cryptoKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
    expect(
      parseRuntimeConfiguration({
        ...base,
        GITHUB_APP_ID: '12345',
        GITHUB_APP_PRIVATE_KEY:
          '-----BEGIN PRIVATE KEY-----\\nZmFrZQ==\\n-----END PRIVATE KEY-----',
        CRYPTO_KEY: cryptoKey,
      }).githubApp,
    ).toEqual({
      appId: '12345',
      privateKey:
        '-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----',
      cryptoKey,
    })
  })

  it.each([
    [{ ...base, BETTER_AUTH_SECRET: 'short' }, 'at least 32'],
    [{ ...base, BETTER_AUTH_URL: 'not-a-url' }, 'valid HTTP'],
    [{ ...base, HYPERDRIVE: undefined }, 'database connection'],
    [{ ...base, GITHUB_APP_CLIENT_ID: 'only-one' }, 'provided together'],
    [{ ...base, GITHUB_APP_ID: '123' }, 'must be provided together'],
    [
      {
        ...base,
        GITHUB_APP_ID: 'not-a-number',
        GITHUB_APP_PRIVATE_KEY:
          '-----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY-----',
        CRYPTO_KEY: btoa('too-short'),
      },
      'positive integer',
    ],
    [
      {
        ...base,
        GITHUB_APP_ID: '123',
        GITHUB_APP_PRIVATE_KEY:
          '-----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY-----',
        CRYPTO_KEY: btoa('too-short'),
      },
      '32-byte key',
    ],
    [{ ...base, DEPLOYMENT_MODE: 'mystery' }, 'DEPLOYMENT_MODE'],
  ])('rejects invalid runtime configuration', (input, message) => {
    expect(() => parseRuntimeConfiguration(input)).toThrow(message)
  })
})
