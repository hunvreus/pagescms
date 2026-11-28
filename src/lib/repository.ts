export type RepositoryRef = Readonly<{
  owner: string
  repo: string
  repoId?: string
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
  repoId?: unknown
}): RepositoryRef {
  if (
    input.repoId !== undefined &&
    (typeof input.repoId !== 'string' ||
      !input.repoId ||
      input.repoId.length > 200)
  )
    throw new Error('Invalid repository ID')
  return {
    ...(typeof input.repoId === 'string' ? { repoId: input.repoId } : {}),
    owner: repositoryIdentifier(input.owner, 'owner'),
    repo: repositoryIdentifier(input.repo, 'repo'),
  }
}

/** Validates the subset of Git reference rules applicable to branch names. */
export function branchName(value: string) {
  const branch = value.trim()
  if (
    !branch ||
    branch.length > 255 ||
    containsControlCharacter(branch) ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.startsWith('.') ||
    branch.endsWith('.') ||
    branch.endsWith('.lock') ||
    branch.includes('..') ||
    branch.includes('//') ||
    branch.includes('@{') ||
    Array.from(branch).some((character) => ' ~^:?*[\\'.includes(character))
  ) {
    throw new Error('Invalid branch name')
  }
  return branch
}
