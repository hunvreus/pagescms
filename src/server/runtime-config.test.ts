import { describe, expect, it } from 'vitest'

import { parseRuntimeConfiguration } from './runtime-config'

describe('parseRuntimeConfiguration', () => {
  const base = {
    BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
    BETTER_AUTH_URL: 'https://app.pagescms.org',
    DATABASE_URL: 'file:.data/pagescms.db',
  }

  it('accepts a positive session cookie cache lifetime', () => {
    expect(
      parseRuntimeConfiguration({ ...base, SESSION_CACHE_SECONDS: '120' }).auth
        .sessionCacheSeconds,
    ).toBe(120)
    for (const value of ['0', '-1', '1.5', 'invalid']) {
      expect(() =>
        parseRuntimeConfiguration({ ...base, SESSION_CACHE_SECONDS: value }),
      ).toThrow('SESSION_CACHE_SECONDS')
    }
  })

  it('uses DATABASE_URL and defaults deployments to self-hosted', () => {
    expect(parseRuntimeConfiguration(base)).toEqual({
      adminEmails: [],
      defaultLanguage: 'en',
      auth: {
        baseUrl: 'https://app.pagescms.org',
        secret: base.BETTER_AUTH_SECRET,
      },
      database: { kind: 'libsql', url: 'file:.data/pagescms.db' },
      cacheDatabase: {
        kind: 'libsql',
        url: 'file:.data/pagescms.db',
      },
      requireAccessPolicy: false,
    })
  })

  it('validates the instance default language', () => {
    expect(
      parseRuntimeConfiguration({ ...base, PAGESCMS_DEFAULT_LANGUAGE: 'fr' })
        .defaultLanguage,
    ).toBe('fr')
    expect(() =>
      parseRuntimeConfiguration({ ...base, PAGESCMS_DEFAULT_LANGUAGE: 'de' }),
    ).toThrow('PAGESCMS_DEFAULT_LANGUAGE')
  })

  it('retains explicit separate cache storage', () => {
    const configuration = parseRuntimeConfiguration({
      ...base,
      CACHE_DATABASE_URL: 'file:.data/separate-cache.db',
    })
    expect(configuration.database).toEqual({
      kind: 'libsql',
      url: base.DATABASE_URL,
    })
    expect(configuration.cacheDatabase).toEqual({
      kind: 'libsql',
      url: 'file:.data/separate-cache.db',
    })
  })

  it('normalizes and deduplicates bootstrap administrators', () => {
    expect(
      parseRuntimeConfiguration({
        ...base,
        ADMIN_EMAILS: ' Admin@example.com,owner@example.com,admin@example.com ',
      }).adminEmails,
    ).toEqual(['admin@example.com', 'owner@example.com'])
  })

  it('accepts paired GitHub OAuth credentials and required access policy', () => {
    expect(
      parseRuntimeConfiguration({
        ...base,
        PAGESCMS_REQUIRE_ACCESS_POLICY: 'true',
        GITHUB_APP_CLIENT_ID: 'client-id',
        GITHUB_APP_CLIENT_SECRET: 'client-secret',
      }),
    ).toMatchObject({
      requireAccessPolicy: true,
      auth: {
        github: { clientId: 'client-id', clientSecret: 'client-secret' },
      },
    })
  })

  it('accepts a remote libSQL URL and auth token', () => {
    expect(
      parseRuntimeConfiguration({
        ...base,
        DATABASE_URL: 'libsql://pagescms.turso.io',
        DATABASE_AUTH_TOKEN: 'token',
      }).database,
    ).toEqual({
      kind: 'libsql',
      url: 'libsql://pagescms.turso.io',
      authToken: 'token',
    })
  })

  it('enables Google independently of GitHub when both credentials are set', () => {
    expect(
      parseRuntimeConfiguration({
        ...base,
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
      }).auth,
    ).toEqual({
      baseUrl: base.BETTER_AUTH_URL,
      secret: base.BETTER_AUTH_SECRET,
      google: {
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
      },
    })
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

  it('accepts a webhook secret independently of server credentials', () => {
    expect(
      parseRuntimeConfiguration({
        ...base,
        GITHUB_APP_WEBHOOK_SECRET: 'webhook-secret',
      }).githubWebhookSecret,
    ).toBe('webhook-secret')
  })

  it('accepts a GitHub App installation slug', () => {
    expect(
      parseRuntimeConfiguration({
        ...base,
        GITHUB_APP_NAME: 'pages-cms',
      }).githubAppName,
    ).toBe('pages-cms')
  })

  it.each([
    [{ ...base, BETTER_AUTH_SECRET: 'short' }, 'at least 32'],
    [{ ...base, BETTER_AUTH_URL: 'not-a-url' }, 'valid HTTP'],
    [{ ...base, DATABASE_URL: undefined }, 'database URL or D1 binding'],
    [{ ...base, GITHUB_APP_CLIENT_ID: 'only-one' }, 'provided together'],
    [{ ...base, GOOGLE_CLIENT_ID: 'only-one' }, 'Google OAuth credentials'],
    [{ ...base, GOOGLE_CLIENT_SECRET: 'only-one' }, 'Google OAuth credentials'],
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
    [
      { ...base, PAGESCMS_REQUIRE_ACCESS_POLICY: 'mystery' },
      'PAGESCMS_REQUIRE_ACCESS_POLICY',
    ],
    [{ ...base, GITHUB_APP_NAME: '../bad' }, 'GitHub App slug'],
  ])('rejects invalid runtime configuration', (input, message) => {
    expect(() => parseRuntimeConfiguration(input)).toThrow(message)
  })
})
