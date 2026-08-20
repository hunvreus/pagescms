const GITHUB_API_URL = 'https://api.github.com'
const MAX_PAGES = 20

export interface GitHubInstallation {
  id: number
  repositorySelection: 'all' | 'selected'
  account: {
    login: string
    type: 'User' | 'Organization'
  }
}

export interface GitHubRepository {
  owner: string
  name: string
  private: boolean
  defaultBranch: string
  updatedAt: string
  canPush: boolean
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: string,
  ) {
    super(message)
    this.name = 'GitHubApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value) {
    throw new Error(`GitHub returned an invalid ${field}`)
  }
  return value
}

function requiredNumber(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`GitHub returned an invalid ${field}`)
  }
  return value
}

function parseInstallation(value: unknown): GitHubInstallation {
  if (!isRecord(value) || !isRecord(value.account)) {
    throw new Error('GitHub returned an invalid installation')
  }
  const accountType = requiredString(value.account.type, 'account type')
  const repositorySelection = requiredString(
    value.repository_selection,
    'repository selection',
  )
  if (accountType !== 'User' && accountType !== 'Organization') {
    throw new Error('GitHub returned an unsupported account type')
  }
  if (repositorySelection !== 'all' && repositorySelection !== 'selected') {
    throw new Error('GitHub returned an unsupported repository selection')
  }

  return {
    id: requiredNumber(value.id, 'installation id'),
    repositorySelection,
    account: {
      login: requiredString(value.account.login, 'account login'),
      type: accountType,
    },
  }
}

function parseRepository(value: unknown): GitHubRepository {
  if (!isRecord(value) || !isRecord(value.owner)) {
    throw new Error('GitHub returned an invalid repository')
  }
  const permissions = isRecord(value.permissions) ? value.permissions : {}

  return {
    owner: requiredString(value.owner.login, 'repository owner'),
    name: requiredString(value.name, 'repository name'),
    private: value.private === true,
    defaultBranch: requiredString(value.default_branch, 'default branch'),
    updatedAt: requiredString(value.updated_at, 'updated timestamp'),
    canPush: permissions.push === true,
  }
}

async function githubRequest(
  fetcher: typeof fetch,
  token: string,
  path: string,
): Promise<Record<string, unknown>> {
  const response = await fetcher(`${GITHUB_API_URL}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'pagescms',
      'x-github-api-version': '2022-11-28',
    },
  })
  const body: unknown = await response.json().catch(() => ({}))

  if (!response.ok) {
    const githubMessage = isRecord(body) ? body.message : undefined
    const message =
      typeof githubMessage === 'string'
        ? githubMessage
        : `GitHub request failed with status ${response.status}`
    const retryAfter =
      response.headers.get('retry-after') ??
      (response.headers.get('x-ratelimit-remaining') === '0'
        ? (response.headers.get('x-ratelimit-reset') ?? undefined)
        : undefined)
    throw new GitHubApiError(message, response.status, retryAfter ?? undefined)
  }
  if (!isRecord(body)) throw new Error('GitHub returned an invalid response')
  return body
}

export function createGitHubApi(token: string, fetcher: typeof fetch = fetch) {
  if (!token.trim()) throw new Error('A GitHub access token is required')

  return {
    async listInstallations(): Promise<GitHubInstallation[]> {
      const installations: GitHubInstallation[] = []
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const body = await githubRequest(
          fetcher,
          token,
          `/user/installations?per_page=100&page=${page}`,
        )
        const values = Array.isArray(body.installations)
          ? body.installations
          : []
        installations.push(...values.map(parseInstallation))
        const totalCount = requiredNumber(
          body.total_count,
          'installation count',
        )
        if (installations.length >= totalCount || values.length === 0) break
      }
      return installations
    },

    async listInstallationRepositories(
      installationId: number,
    ): Promise<GitHubRepository[]> {
      if (!Number.isInteger(installationId) || installationId <= 0) {
        throw new Error('Invalid GitHub installation id')
      }
      const repositories: GitHubRepository[] = []
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const body = await githubRequest(
          fetcher,
          token,
          `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
        )
        const values = Array.isArray(body.repositories) ? body.repositories : []
        repositories.push(...values.map(parseRepository))
        const totalCount = requiredNumber(body.total_count, 'repository count')
        if (repositories.length >= totalCount || values.length === 0) break
      }
      return repositories
    },

    async searchRepositories(input: {
      owner: string
      type: 'user' | 'org'
      keyword: string
    }): Promise<GitHubRepository[]> {
      const qualifier = input.type === 'org' ? 'org' : 'user'
      const query = `${input.keyword.trim()} in:name ${qualifier}:${input.owner} fork:true`
      const parameters = new URLSearchParams({
        q: query,
        sort: 'updated',
        order: 'desc',
        per_page: '10',
      })
      const body = await githubRequest(
        fetcher,
        token,
        `/search/repositories?${parameters.toString()}`,
      )
      return (Array.isArray(body.items) ? body.items : []).map(parseRepository)
    },
  }
}

export type GitHubApi = ReturnType<typeof createGitHubApi>
