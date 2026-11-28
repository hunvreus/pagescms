import { decryptSecret, encryptSecret } from '#/server/auth/secret-crypto'

const prefix = '$pagescms$1$'
const derivedKeys = new Map<string, string>()

async function tokenKey(secret: string) {
  const cached = derivedKeys.get(secret)
  if (cached) return cached
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`pagescms:oauth-token:v1\0${secret}`),
  )
  const key = btoa(String.fromCharCode(...new Uint8Array(digest)))
  if (derivedKeys.size >= 8)
    derivedKeys.delete(derivedKeys.keys().next().value!)
  derivedKeys.set(secret, key)
  return key
}

export function isPagesCmsToken(value: string) {
  return value.startsWith(prefix)
}

export async function encryptOAuthToken(value: string, secret: string) {
  const { ciphertext, iv } = await encryptSecret(value, await tokenKey(secret))
  return `${prefix}${iv}$${ciphertext}`
}

export async function decryptOAuthToken(value: string, secret: string) {
  if (!isPagesCmsToken(value)) throw new Error('Invalid OAuth token format')
  const parts = value.slice(prefix.length).split('$')
  if (parts.length !== 2 || !parts[0] || !parts[1])
    throw new Error('Invalid OAuth token format')
  return decryptSecret(parts[1], parts[0], await tokenKey(secret))
}

export async function encryptAccountTokens<
  T extends {
    accessToken?: string | null
    refreshToken?: string | null
  },
>(account: T, secret: string): Promise<T> {
  const [accessToken, refreshToken] = await Promise.all([
    account.accessToken
      ? encryptOAuthToken(account.accessToken, secret)
      : account.accessToken,
    account.refreshToken
      ? encryptOAuthToken(account.refreshToken, secret)
      : account.refreshToken,
  ])
  return {
    ...account,
    ...(account.accessToken === undefined ? {} : { accessToken }),
    ...(account.refreshToken === undefined ? {} : { refreshToken }),
  }
}
