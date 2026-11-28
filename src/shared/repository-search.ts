import type { RepositoryAccount } from '#/server/repository/repositories'

export function parseRepositorySearch(input: unknown): {
  account: RepositoryAccount
  keyword: string
} {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid repository search')
  }
  const value = input as Record<string, unknown>
  const account = value.account
  if (typeof account !== 'object' || account === null) {
    throw new Error('Invalid project account')
  }
  const candidate = account as Record<string, unknown>
  if (
    typeof candidate.login !== 'string' ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(candidate.login) ||
    (candidate.type !== 'user' && candidate.type !== 'org') ||
    (candidate.repositorySelection !== 'all' &&
      candidate.repositorySelection !== 'selected') ||
    typeof candidate.installationId !== 'number' ||
    !Number.isInteger(candidate.installationId) ||
    candidate.installationId <= 0
  ) {
    throw new Error('Invalid project account')
  }
  const keyword = typeof value.keyword === 'string' ? value.keyword.trim() : ''
  if (keyword.length > 100) throw new Error('Repository search is too long')

  return {
    account: {
      login: candidate.login,
      type: candidate.type,
      repositorySelection: candidate.repositorySelection,
      installationId: candidate.installationId,
    },
    keyword,
  }
}
