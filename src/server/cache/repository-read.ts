import { repositorySource } from '#/server/repository/provider'

const credential = Symbol('repository credential')
const entries = new Map<
  string,
  {
    value: unknown
    expires: number
    created: number
    size: number
    failed?: boolean
  }
>()
let size = 0

function remove(key: string) {
  const entry = entries.get(key)
  if (entry) size -= entry.size
  entries.delete(key)
}

function estimateSize(value: unknown): number {
  if (typeof value === 'string') return value.length * 2
  if (!value || typeof value !== 'object') return 8
  if (Array.isArray(value))
    return 32 + value.reduce<number>((sum, item) => sum + estimateSize(item), 0)
  return (
    32 +
    Object.entries(value).reduce(
      (sum, [key, item]) => sum + key.length * 2 + estimateSize(item),
      0,
    )
  )
}

function store(key: string, value: unknown, ttl: number, failed = false) {
  const length = estimateSize(value)
  remove(key)
  if (length > 2_000_000) return
  while (entries.size >= 256 || size + length > 2_000_000)
    remove(entries.keys().next().value!)
  const created = Date.now()
  entries.set(key, {
    value,
    expires: created + ttl,
    created,
    size: length,
    failed,
  })
  size += length
}

type Reader = object & { [credential]?: Promise<string> }

export function registerRepositoryReader(api: object, token: string) {
  ;(api as Reader)[credential] = crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(token))
    .then((hash) =>
      Array.from(new Uint8Array(hash), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    )
}

export async function readRepositoryCached<T>(
  api: object,
  owner: string,
  repo: string,
  resource: string,
  ttlMs: number,
  load: () => Promise<T>,
  cacheFailure?: (error: unknown) => boolean,
): Promise<T> {
  const tokenHash = (api as Reader)[credential]
  if (!tokenHash || ttlMs <= 0) return load()
  const key = JSON.stringify([
    repositorySource(api),
    owner.toLowerCase(),
    repo.toLowerCase(),
    await tokenHash,
    resource,
  ])
  const cached = entries.get(key)
  if (
    cached &&
    cached.expires > Date.now() &&
    cached.created + ttlMs > Date.now()
  ) {
    if (cached.failed) throw cached.value
    return cached.value as T
  }
  remove(key)
  try {
    const value = await load()
    store(key, value, ttlMs)
    return value
  } catch (error) {
    if (cacheFailure?.(error)) {
      store(key, error, Math.min(ttlMs, 15_000), true)
    }
    throw error
  }
}

export function invalidateRepositoryReads(
  owner: string,
  repo?: string,
  source?: string,
) {
  for (const key of entries.keys()) {
    const coordinates = JSON.parse(key) as string[]
    if (
      (!source || coordinates[0] === source) &&
      coordinates[1] === owner.toLowerCase() &&
      (!repo || coordinates[2] === repo.toLowerCase())
    )
      remove(key)
  }
}
