import { describe, expect, it } from 'vitest'

import { parseRuntimeConfiguration } from './runtime-config.server'

describe('parseRuntimeConfiguration', () => {
  const base = {
    BETTER_AUTH_SECRET: 'a-secure-auth-secret-with-32-characters',
    BETTER_AUTH_URL: 'https://app.pagescms.org',
    DATABASE_URL: 'postgres://supabase.example/pagescms',
  }

  it('uses DATABASE_URL and defaults deployments to self-hosted', () => {
    expect(parseRuntimeConfiguration(base)).toEqual({
      adminEmails: [],
      auth: {
        baseUrl: 'https://app.pagescms.org',
        secret: base.BETTER_AUTH_SECRET,
      },
      databaseConnectionString: 'postgres://supabase.example/pagescms',
      deployment: 'self-hosted',
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

  it('accepts a local PostgreSQL connection string', () => {
    expect(
      parseRuntimeConfiguration({
        ...base,
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
    [{ ...base, DATABASE_URL: undefined }, 'database connection'],
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
    [{ ...base, GITHUB_APP_NAME: '../bad' }, 'GitHub App slug'],
  ])('rejects invalid runtime configuration', (input, message) => {
    expect(() => parseRuntimeConfiguration(input)).toThrow(message)
  })
})
