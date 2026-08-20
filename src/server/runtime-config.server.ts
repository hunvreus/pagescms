export type AuthRuntimeConfiguration = Readonly<{
  baseUrl: string
  secret: string
  github?: Readonly<{
    clientId: string
    clientSecret: string
  }>
}>

export type RuntimeConfiguration = Readonly<{
  auth: AuthRuntimeConfiguration
  databaseConnectionString: string
  deployment: 'self-hosted' | 'hosted'
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
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

export function parseRuntimeConfiguration(
  environment: unknown,
): RuntimeConfiguration {
  if (!isRecord(environment)) throw new Error('Worker environment is invalid')

  const secret = optionalString(
    environment.BETTER_AUTH_SECRET ?? environment.AUTH_SECRET,
  )
  if (!secret || secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters')
  }

  const hyperdrive = isRecord(environment.HYPERDRIVE)
    ? optionalString(environment.HYPERDRIVE.connectionString)
    : undefined
  const databaseConnectionString =
    hyperdrive ?? optionalString(environment.DATABASE_URL)
  if (!databaseConnectionString) {
    throw new Error('A database connection is required')
  }

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

  return {
    auth: {
      baseUrl: parseBaseUrl(environment.BETTER_AUTH_URL),
      secret,
      ...(clientId && clientSecret
        ? { github: { clientId, clientSecret } }
        : {}),
    },
    databaseConnectionString,
    deployment: deploymentValue,
  }
}
