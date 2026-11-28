import {
  knownRepositoryIdentity,
  repositoryIdentityKey,
} from '#/lib/repository-identity'
import { accountWasDeleted } from '#/features/account/local-account-storage'

export interface RecentRepository {
  repoId: string
  source: string
  owner: string
  repo: string
  branch: string
  timestamp: number
}

export const RECENT_PROJECTS_KEY = 'latestVisits'
const MAX_RECENT_PROJECTS = 5

function isRecentRepository(value: unknown): value is RecentRepository {
  if (typeof value !== 'object' || value === null) return false
  const repository = value as Record<string, unknown>
  return (
    typeof repository.owner === 'string' &&
    repository.owner.length > 0 &&
    typeof repository.repo === 'string' &&
    repository.repo.length > 0 &&
    typeof repository.branch === 'string' &&
    repository.branch.length > 0 &&
    typeof repository.timestamp === 'number' &&
    Number.isFinite(repository.timestamp) &&
    typeof repository.repoId === 'string' &&
    repository.repoId.length > 0 &&
    typeof repository.source === 'string' &&
    repository.source.length > 0
  )
}

function normalizeRecentRepositories(
  repositories: readonly RecentRepository[],
) {
  const unique = new Map<string, RecentRepository>()
  for (const visit of [...repositories].sort(
    (a, b) => b.timestamp - a.timestamp,
  )) {
    const key = repositoryIdentityKey(visit)
    if (unique.has(key)) continue
    const known = knownRepositoryIdentity(visit)
    unique.set(
      key,
      known && String(known.id) === visit.repoId
        ? { ...visit, owner: known.owner, repo: known.repo }
        : visit,
    )
  }
  return [...unique.values()].slice(0, MAX_RECENT_PROJECTS)
}

export function parseRecentRepositories(
  value: string | null,
): RecentRepository[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return normalizeRecentRepositories(parsed.filter(isRecentRepository))
  } catch {
    return []
  }
}

export function addRecentRepository(
  repositories: readonly RecentRepository[],
  repository: RecentRepository,
): RecentRepository[] {
  return normalizeRecentRepositories([repository, ...repositories])
}

export function readRecentRepositories(account: string): RecentRepository[] {
  try {
    return parseRecentRepositories(
      window.localStorage.getItem(`${RECENT_PROJECTS_KEY}:${account}`),
    )
  } catch {
    return []
  }
}

export function trackRecentRepository(
  account: string,
  repository: Omit<RecentRepository, 'timestamp'>,
): void {
  if (accountWasDeleted(account)) return
  const repositories = addRecentRepository(readRecentRepositories(account), {
    ...repository,
    timestamp: Math.floor(Date.now() / 1000),
  })
  try {
    window.localStorage.setItem(
      `${RECENT_PROJECTS_KEY}:${account}`,
      JSON.stringify(repositories),
    )
  } catch {
    // Recent repositories are optional when browser storage is unavailable.
  }
}
