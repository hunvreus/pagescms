import type { RuntimeConfiguration } from './runtime-config.server'

type GitHubAppConfiguration = NonNullable<RuntimeConfiguration['githubApp']>

const GITHUB_API_URL = 'https://api.github.com'
const RSA_ALGORITHM_IDENTIFIER = Uint8Array.from([
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
  0x05, 0x00,
])

function encodeLength(length: number) {
  if (length < 0x80) return Uint8Array.of(length)
  const bytes: number[] = []
  for (let remaining = length; remaining > 0; remaining >>>= 8) {
    bytes.unshift(remaining & 0xff)
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes)
}

function der(tag: number, value: Uint8Array) {
  return Uint8Array.of(tag, ...encodeLength(value.byteLength), ...value)
}

function concatenate(...values: Uint8Array[]) {
  const result = new Uint8Array(
    values.reduce((length, value) => length + value.byteLength, 0),
  )
  let offset = 0
  for (const value of values) {
    result.set(value, offset)
    offset += value.byteLength
  }
  return result
}

function decodePem(privateKey: string) {
  const pkcs1 = privateKey.includes('BEGIN RSA PRIVATE KEY')
  const bytes = Uint8Array.from(
    atob(privateKey.replace(/-----[^-]+-----|\s/g, '')),
    (character) => character.charCodeAt(0),
  )
  if (!pkcs1) return bytes
  return der(
    0x30,
    concatenate(
      Uint8Array.of(0x02, 0x01, 0x00),
      RSA_ALGORITHM_IDENTIFIER,
      der(0x04, bytes),
    ),
  )
}

function base64Url(value: string | ArrayBuffer) {
  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export async function createGitHubAppJwt(
  configuration: Pick<GitHubAppConfiguration, 'appId' | 'privateKey'>,
  now = Date.now(),
) {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const issuedAt = Math.floor(now / 1000) - 60
  const payload = base64Url(
    JSON.stringify({
      iat: issuedAt,
      exp: issuedAt + 600,
      iss: configuration.appId,
    }),
  )
  const unsigned = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePem(configuration.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  )
  return `${unsigned}.${base64Url(signature)}`
}

function requiredRecord(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('GitHub returned an invalid App response')
  }
  return value as Record<string, unknown>
}

export function createGitHubAppApi(
  configuration: Pick<GitHubAppConfiguration, 'appId' | 'privateKey'>,
  fetcher: typeof fetch = fetch,
) {
  async function request(path: string, init: RequestInit = {}) {
    const response = await fetcher(`${GITHUB_API_URL}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${await createGitHubAppJwt(configuration)}`,
        'user-agent': 'pagescms',
        'x-github-api-version': '2022-11-28',
        ...init.headers,
      },
    })
    const body: unknown = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = requiredRecord(body).message
      throw new Error(
        typeof message === 'string'
          ? message
          : `GitHub App request failed with status ${response.status}`,
      )
    }
    return requiredRecord(body)
  }

  return {
    async createInstallationToken(installationId: number) {
      if (!Number.isInteger(installationId) || installationId <= 0) {
        throw new Error('Invalid GitHub installation id')
      }
      const body = await request(
        `/app/installations/${installationId}/access_tokens`,
        { method: 'POST' },
      )
      if (
        typeof body.token !== 'string' ||
        typeof body.expires_at !== 'string'
      ) {
        throw new Error('GitHub returned an invalid installation token')
      }
      const expiresAt = new Date(body.expires_at)
      if (Number.isNaN(expiresAt.getTime())) {
        throw new Error('GitHub returned an invalid token expiry')
      }
      return { token: body.token, expiresAt }
    },
  }
}
