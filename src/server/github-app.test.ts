import { generateKeyPairSync, verify } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { createGitHubAppApi, createGitHubAppJwt } from './github-app.server'

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
