import { isRecord } from '#/shared/json'
import { isLocale } from '#/i18n/locale'
import type { Locale } from '#/i18n/locale'
import type { AnyD1Database } from 'drizzle-orm/d1'
import type { DatabaseSource } from '#/server/db/client'

export type AuthRuntimeConfiguration = Readonly<{
  baseUrl: string
  secret: string
  defaultLanguage?: Locale
  sessionCacheSeconds?: number
  clientIpHeader?: string
  github?: Readonly<{
    clientId: string
    clientSecret: string
  }>
  google?: Readonly<{
    clientId: string
    clientSecret: string
  }>
}>

export type RuntimeConfiguration = Readonly<{
  adminEmails: readonly string[]
  defaultLanguage: Locale
  auth: AuthRuntimeConfiguration
  database: DatabaseSource
  cacheDatabase: DatabaseSource
  requireAccessPolicy: boolean
  githubWebhookSecret?: string
  githubAppName?: string
  githubApp?: Readonly<{
    appId: string
    privateKey: string
    cryptoKey: string
  }>
}>

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
  const cacheUrl = optionalString(environment.CACHE_DATABASE_URL) ?? url
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

  const sessionCacheValue = optionalString(environment.SESSION_CACHE_SECONDS)
  const sessionCacheSeconds =
    sessionCacheValue === undefined ? undefined : Number(sessionCacheValue)
  if (
    sessionCacheSeconds !== undefined &&
    (!Number.isSafeInteger(sessionCacheSeconds) || sessionCacheSeconds < 1)
  )
    throw new Error('SESSION_CACHE_SECONDS must be a positive integer')

  const clientId = optionalString(environment.GITHUB_APP_CLIENT_ID)
  const clientSecret = optionalString(environment.GITHUB_APP_CLIENT_SECRET)
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error('GitHub OAuth credentials must be provided together')
  }
  const googleClientId = optionalString(environment.GOOGLE_CLIENT_ID)
  const googleClientSecret = optionalString(environment.GOOGLE_CLIENT_SECRET)
  if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
    throw new Error('Google OAuth credentials must be provided together')
  }

  const policyRequired = optionalString(
    environment.PAGESCMS_REQUIRE_ACCESS_POLICY,
  )
  if (policyRequired && !['true', 'false'].includes(policyRequired))
    throw new Error('PAGESCMS_REQUIRE_ACCESS_POLICY must be true or false')
  const requireAccessPolicy = policyRequired === 'true'

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

  const defaultLanguage =
    optionalString(environment.PAGESCMS_DEFAULT_LANGUAGE) ?? 'en'
  if (!isLocale(defaultLanguage))
    throw new Error(
      'PAGESCMS_DEFAULT_LANGUAGE must be one of: en, fr, es, pt-BR, zh-CN',
    )
  return {
    adminEmails: (optionalString(environment.ADMIN_EMAILS) ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(
        (email, index, values) => email && values.indexOf(email) === index,
      ),
    defaultLanguage,
    auth: {
      baseUrl: parseBaseUrl(environment.BETTER_AUTH_URL),
      secret,
      ...(sessionCacheSeconds === undefined ? {} : { sessionCacheSeconds }),
      ...(clientId && clientSecret
        ? { github: { clientId, clientSecret } }
        : {}),
      ...(googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : {}),
    },
    ...databases,
    requireAccessPolicy,
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
