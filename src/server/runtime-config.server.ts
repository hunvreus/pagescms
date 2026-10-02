import type { AnyD1Database } from 'drizzle-orm/d1'
import type { DatabaseSource } from './database/client.server'

export type AuthRuntimeConfiguration = Readonly<{
  baseUrl: string
  secret: string
  github?: Readonly<{
    clientId: string
    clientSecret: string
  }>
}>

export type RuntimeConfiguration = Readonly<{
  adminEmails: readonly string[]
  auth: AuthRuntimeConfiguration
  database: DatabaseSource
  cacheDatabase: DatabaseSource
  deployment: 'self-hosted' | 'hosted'
  githubWebhookSecret?: string
  githubAppName?: string
  githubApp?: Readonly<{
    appId: string
    privateKey: string
    cryptoKey: string
  }>
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function d1Binding(value: unknown): AnyD1Database | undefined {
  if (!isRecord(value)) return undefined
  return typeof value.prepare === 'function' &&
    typeof value.batch === 'function' &&
    typeof value.exec === 'function'
    ? (value as unknown as AnyD1Database)
    : undefined
}

function localCacheUrl(url: string) {
  if (!url.startsWith('file:')) return url
  if (url === 'file::memory:') return url
  return url.endsWith('.db') ? `${url.slice(0, -3)}-cache.db` : `${url}-cache`
}

export function sameDatabaseSource(
  left: DatabaseSource,
  right: DatabaseSource,
) {
  if (left.kind !== right.kind) return false
  return left.kind === 'd1'
    ? left.binding ===
        (right as Extract<DatabaseSource, { kind: 'd1' }>).binding
    : left.url === (right as Extract<DatabaseSource, { kind: 'libsql' }>).url &&
        left.authToken ===
          (right as Extract<DatabaseSource, { kind: 'libsql' }>).authToken
}

function databaseSources(environment: Record<string, unknown>) {
  const databaseBinding = d1Binding(environment.DATABASE)
  const cacheBinding = d1Binding(environment.CACHE_DATABASE)
  if (databaseBinding) {
    return {
      database: { kind: 'd1', binding: databaseBinding } as const,
      cacheDatabase: {
        kind: 'd1',
        binding: cacheBinding ?? databaseBinding,
      } as const,
    }
  }
  if (cacheBinding) {
    throw new Error('DATABASE binding is required with CACHE_DATABASE')
  }

  const url = optionalString(environment.DATABASE_URL)
  if (!url) throw new Error('A database URL or D1 binding is required')
  const authToken = optionalString(environment.DATABASE_AUTH_TOKEN)
  const cacheUrl =
    optionalString(environment.CACHE_DATABASE_URL) ?? localCacheUrl(url)
  const cacheAuthToken =
    optionalString(environment.CACHE_DATABASE_AUTH_TOKEN) ?? authToken
  return {
    database: {
      kind: 'libsql',
      url,
      ...(authToken ? { authToken } : {}),
    } as const,
    cacheDatabase: {
      kind: 'libsql',
      url: cacheUrl,
      ...(cacheAuthToken ? { authToken: cacheAuthToken } : {}),
    } as const,
  }
}

function parseBaseUrl(value: unknown) {
  const raw = optionalString(value)
  if (!raw) throw new Error('BETTER_AUTH_URL must be a valid HTTP URL')

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('BETTER_AUTH_URL must be a valid HTTP URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('BETTER_AUTH_URL must be a valid HTTP URL')
  }
  return url.toString().replace(/\/$/, '')
}

function parseCryptoKey(value: string) {
  try {
    const bytes = Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0),
    )
    if (bytes.byteLength !== 32) throw new Error()
  } catch {
    throw new Error('CRYPTO_KEY must be a base64-encoded 32-byte key')
  }
  return value
}

export function parseRuntimeConfiguration(
  environment: unknown,
): RuntimeConfiguration {
  if (!isRecord(environment)) throw new Error('Runtime environment is invalid')

  const secret = optionalString(
    environment.BETTER_AUTH_SECRET ?? environment.AUTH_SECRET,
  )
  if (!secret || secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters')
  }

  const databases = databaseSources(environment)

  const clientId = optionalString(environment.GITHUB_APP_CLIENT_ID)
  const clientSecret = optionalString(environment.GITHUB_APP_CLIENT_SECRET)
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error('GitHub OAuth credentials must be provided together')
  }

  const deploymentValue =
    optionalString(environment.DEPLOYMENT_MODE) ?? 'self-hosted'
  if (deploymentValue !== 'self-hosted' && deploymentValue !== 'hosted') {
    throw new Error('DEPLOYMENT_MODE must be self-hosted or hosted')
  }

  const appId = optionalString(environment.GITHUB_APP_ID)
  const privateKey = optionalString(
    environment.GITHUB_APP_PRIVATE_KEY,
  )?.replace(/\\n/g, '\n')
  const cryptoKey = optionalString(environment.CRYPTO_KEY)
  const githubWebhookSecret = optionalString(
    environment.GITHUB_APP_WEBHOOK_SECRET,
  )
  const githubAppName = optionalString(environment.GITHUB_APP_NAME)
  if (githubAppName && !/^[A-Za-z0-9-]+$/.test(githubAppName)) {
    throw new Error('GITHUB_APP_NAME must be a GitHub App slug')
  }
  const githubAppValues = [appId, privateKey, cryptoKey]
  if (githubAppValues.some(Boolean) && !githubAppValues.every(Boolean)) {
    throw new Error(
      'GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and CRYPTO_KEY must be provided together',
    )
  }
  if (appId && (!/^\d+$/.test(appId) || appId === '0')) {
    throw new Error('GITHUB_APP_ID must be a positive integer')
  }
  if (privateKey && !privateKey.includes('PRIVATE KEY-----')) {
    throw new Error('GITHUB_APP_PRIVATE_KEY must be a PEM private key')
  }

  return {
    adminEmails: (optionalString(environment.ADMIN_EMAILS) ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(
        (email, index, values) => email && values.indexOf(email) === index,
      ),
    auth: {
      baseUrl: parseBaseUrl(environment.BETTER_AUTH_URL),
      secret,
      ...(clientId && clientSecret
        ? { github: { clientId, clientSecret } }
        : {}),
    },
    ...databases,
    deployment: deploymentValue,
    ...(githubWebhookSecret ? { githubWebhookSecret } : {}),
    ...(githubAppName ? { githubAppName } : {}),
    ...(appId && privateKey && cryptoKey
      ? {
          githubApp: {
            appId,
            privateKey,
            cryptoKey: parseCryptoKey(cryptoKey),
          },
        }
      : {}),
  }
}
