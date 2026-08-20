import { normalizeGitPath } from './git-path'

export type RepositoryRef = Readonly<{
  owner: string
  repo: string
}>

function containsControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
  })
}

function repositoryIdentifier(value: string, field: 'owner' | 'repo') {
  const normalized = value.trim()

  if (
    !normalized ||
    normalized.includes('/') ||
    containsControlCharacter(normalized)
  ) {
    throw new Error(`Invalid repository ${field}`)
  }

  return normalized
}

/** Preserves GitHub display casing while validating repository coordinates. */
export function repositoryRef(input: {
  owner: string
  repo: string
}): RepositoryRef {
  return {
    owner: repositoryIdentifier(input.owner, 'owner'),
    repo: repositoryIdentifier(input.repo, 'repo'),
  }
}

/** Encodes dynamic route values as one URL path segment. */
export function encodeRouteSegment(value: string): string {
  if (!value) throw new Error('Cannot encode an empty route segment')
  return encodeURIComponent(value)
}

/** Decodes one routing boundary exactly once. */
export function decodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error('Invalid encoded route segment')
  }
}

function canonicalRepositoryCoordinates(repository: RepositoryRef) {
  const validated = repositoryRef(repository)
  return [validated.owner.toLowerCase(), validated.repo.toLowerCase()] as const
}

function assertBranch(branch: string) {
  if (!branch || containsControlCharacter(branch)) {
    throw new Error('Invalid branch name')
  }

  return branch
}

export function repositoryCacheKey(repository: RepositoryRef) {
  const [owner, repo] = canonicalRepositoryCoordinates(repository)
  return ['repository', owner, repo] as const
}

export function branchCacheKey(repository: RepositoryRef, branch: string) {
  const [owner, repo] = canonicalRepositoryCoordinates(repository)
  return ['branch', owner, repo, assertBranch(branch)] as const
}

export function fileCacheKey(
  repository: RepositoryRef,
  branch: string,
  path: string,
) {
  const [owner, repo] = canonicalRepositoryCoordinates(repository)
  return [
    'file',
    owner,
    repo,
    assertBranch(branch),
    normalizeGitPath(path),
  ] as const
}
