export type RepositoryAddress = { owner: string; repo: string; source?: string }
export type RepositoryIdentity = RepositoryAddress & { id: string | number }

const addresses = new Map<string, RepositoryIdentity>()
function addressKey(address: RepositoryAddress) {
  return JSON.stringify([
    address.source ?? 'github.com',
    address.owner.toLowerCase(),
    address.repo.toLowerCase(),
  ])
}

// Address hints only select client cache/lock scopes. They never grant access.
export function rememberRepositoryIdentity(
  repository: RepositoryIdentity,
  requested?: RepositoryAddress,
) {
  for (const address of [repository, ...(requested ? [requested] : [])]) {
    const key = addressKey({ ...address, source: repository.source })
    addresses.delete(key)
    addresses.set(key, repository)
  }
  while (addresses.size > 512) addresses.delete(addresses.keys().next().value!)
}

export function knownRepositoryIdentity(address: RepositoryAddress) {
  return addresses.get(addressKey(address))
}

export function repositoryIdentityKey(
  address: RepositoryAddress & { repoId?: string },
) {
  return JSON.stringify([
    address.source ?? 'github.com',
    address.repoId ?? [
      'address',
      address.owner.toLowerCase(),
      address.repo.toLowerCase(),
    ],
  ])
}

export function canonicalRepositoryHref(
  href: string,
  repository: RepositoryAddress,
) {
  const match = /^\/github\/[^/]+\/[^/]+(?=\/|\?|#|$)/.exec(href)
  if (!match) return href
  return `/github/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}${href.slice(match[0].length)}`
}

export function repositoryRequest<T extends RepositoryAddress>(
  input: T,
  repoId?: string,
): T & { repoId?: string } {
  const id =
    repoId ??
    ('repoId' in input && typeof input.repoId === 'string'
      ? input.repoId
      : undefined) ??
    knownRepositoryIdentity(input)?.id
  return id === undefined ? input : { ...input, repoId: String(id) }
}

export function externalRepositoryId(value: unknown): string {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    !String(value) ||
    (typeof value === 'number' && !Number.isFinite(value))
  )
    throw new Error('Repository ID is missing')
  return String(value)
}
