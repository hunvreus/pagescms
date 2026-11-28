import { generateKeyPairSync, verify } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { createGitHubAppApi, createGitHubAppJwt } from '#/server/github/app'

function keyPair(type: 'pkcs1' | 'pkcs8') {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    privateKey: pair.privateKey.export({ type, format: 'pem' }).toString(),
    publicKey: pair.publicKey,
  }
}

function decodeSegment(value: string) {
  return JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(
        atob(value.replace(/-/g, '+').replace(/_/g, '/')),
        (character) => character.charCodeAt(0),
      ),
    ),
  ) as Record<string, unknown>
}

describe('GitHub App authentication', () => {
  it('verifies the current account for an installation with App authentication', async () => {
    const { privateKey } = keyPair('pkcs8')
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ id: 42, account: { id: 99, login: 'renamed' } }),
    )
    const api = createGitHubAppApi({ appId: '12345', privateKey }, fetcher)
    await expect(api.getInstallationAccount(42)).resolves.toEqual({
      id: 99,
      login: 'renamed',
    })
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.github.com/app/installations/42',
    )
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization'),
    ).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/)
    const invalid = createGitHubAppApi(
      { appId: '12345', privateKey },
      async () =>
        Response.json({ id: 43, account: { id: 99, login: 'renamed' } }),
    )
    await expect(invalid.getInstallationAccount(42)).rejects.toThrow(
      'invalid installation account',
    )
  })
  it('looks up only the requested repository installation with App authentication', async () => {
    const { privateKey } = keyPair('pkcs8')
    const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
      Response.json({
        id: 42,
        account: { login: 'PagesCMS', type: 'Organization' },
      }),
    )
    await expect(
      createGitHubAppApi(
        { appId: '12345', privateKey },
        fetcher,
      ).getRepositoryInstallation('PagesCMS', 'site'),
    ).resolves.toEqual({
      id: 42,
      account: { login: 'PagesCMS', type: 'Organization' },
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api.github.com/repos/PagesCMS/site/installation',
    )
  })
  it.each(['pkcs1', 'pkcs8'] as const)(
    'signs a valid App JWT from a %s private key',
    async (type) => {
      const pair = keyPair(type)
      const jwt = await createGitHubAppJwt(
        { appId: '12345', privateKey: pair.privateKey },
        1_800_000,
      )
      const [header, payload, signature] = jwt.split('.') as [
        string,
        string,
        string,
      ]

      expect(decodeSegment(header)).toEqual({ alg: 'RS256', typ: 'JWT' })
      expect(decodeSegment(payload)).toEqual({
        iat: 1740,
        exp: 2340,
        iss: '12345',
      })
      expect(
        verify(
          'RSA-SHA256',
          Buffer.from(`${header}.${payload}`),
          pair.publicKey,
          Buffer.from(signature, 'base64url'),
        ),
      ).toBe(true)
    },
  )

  it('reuses the signing key and token until shortly before expiry', async () => {
    const { privateKey } = keyPair('pkcs8')
    const configuration = { appId: 'cache-test', privateKey }
    const importKey = vi.spyOn(crypto.subtle, 'importKey')
    const sign = vi.spyOn(crypto.subtle, 'sign')
    try {
      const first = await createGitHubAppJwt(configuration, 1_800_000)
      expect(await createGitHubAppJwt(configuration, 1_800_000)).toBe(first)
      expect(await createGitHubAppJwt(configuration, 2_338_000)).toBe(first)
      const renewed = await createGitHubAppJwt(configuration, 2_339_000)
      expect(renewed).not.toBe(first)
      expect(importKey).toHaveBeenCalledTimes(1)
      expect(sign).toHaveBeenCalledTimes(2)
      const otherApp = await createGitHubAppJwt(
        { ...configuration, appId: 'other' },
        2_339_000,
      )
      expect(decodeSegment(otherApp.split('.')[1]).iss).toBe('other')
      expect(importKey).toHaveBeenCalledTimes(1)
    } finally {
      importKey.mockRestore()
      sign.mockRestore()
    }
  })

  it('requests and validates an installation token', async () => {
    const { privateKey } = keyPair('pkcs8')
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          token: 'ghs_installation',
          expires_at: '2026-08-20T01:00:00.000Z',
        }),
    )
    const token = await createGitHubAppApi(
      { appId: '12345', privateKey },
      fetcher,
    ).createInstallationToken(42)

    expect(token).toEqual({
      token: 'ghs_installation',
      expiresAt: new Date('2026-08-20T01:00:00.000Z'),
    })
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe(
      'https://api.github.com/app/installations/42/access_tokens',
    )
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toMatch(
      /^Bearer [^.]+\.[^.]+\.[^.]+$/,
    )
  })
})
