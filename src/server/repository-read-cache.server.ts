// Bounded and credential-scoped. Tokens are hashed, never retained in keys.
import { repositorySource } from './repository-provider.server'

const identities = new WeakMap<object, Promise<string>>()
const entries = new Map<string, { value: unknown; expires: number }>()
const pending = new Map<string, Promise<unknown>>()
const fetcherIds = new WeakMap<object, string>()

export function registerRepositoryReader(
  api: object,
  token: string,
  fetcher: object,
) {
  let fetcherId = fetcherIds.get(fetcher)
  if (!fetcherId) {
    fetcherId = crypto.randomUUID()
    fetcherIds.set(fetcher, fetcherId)
  }
  const prefix = fetcherId
  identities.set(
    api,
    crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(token))
      .then(
        (hash) =>
          `${prefix}:${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
      ),
  )
}

export async function readRepositoryCached<T>(
  api: object,
  owner: string,
  repo: string,
  resource: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  let identity = identities.get(api)
  if (!identity) {
    identity = Promise.resolve(crypto.randomUUID())
    identities.set(api, identity)
  }
  const key = JSON.stringify([
    repositorySource(api),
    owner.toLowerCase(),
    repo.toLowerCase(),
    await identity,
    resource,
  ])
  const cached = entries.get(key)
  if (cached && cached.expires > Date.now()) return cached.value as T
  entries.delete(key)
  const existing = pending.get(key)
  if (existing) return existing as Promise<T>
  const request = load()
    .then((value) => {
      if (pending.get(key) === request && ttlMs > 0) {
        while (entries.size >= 256) entries.delete(entries.keys().next().value!)
        entries.set(key, { value, expires: Date.now() + ttlMs })
      }
      return value
    })
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key)
    })
  pending.set(key, request)
  return request
}

export function invalidateRepositoryReads(
  owner: string,
  repo?: string,
  source?: string,
) {
  for (const key of new Set([...entries.keys(), ...pending.keys()])) {
    const coordinates = JSON.parse(key) as string[]
    if (
      (!source || coordinates[0] === source) &&
      coordinates[1] === owner.toLowerCase() &&
      (!repo || coordinates[2] === repo.toLowerCase())
    ) {
      entries.delete(key)
      pending.delete(key)
    }
  }
}
