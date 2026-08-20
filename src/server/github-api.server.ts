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

export interface GitHubRepositorySnapshot {
  id: number
  owner: string
  ownerId: number
  repo: string
  defaultBranch: string
  private: boolean
}

export interface GitHubFile {
  sha: string
  content: string
}

export interface GitHubDirectoryEntry {
  type: 'file' | 'dir'
  name: string
  path: string
  sha: string | null
  content: string | null
  size: number | null
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

function requiredRecord(value: unknown, field: string) {
  if (!isRecord(value)) throw new Error(`GitHub returned an invalid ${field}`)
  return value
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
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetcher(`${GITHUB_API_URL}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'pagescms',
      'x-github-api-version': '2022-11-28',
      ...init.headers,
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
  return body
}

export function createGitHubApi(token: string, fetcher: typeof fetch = fetch) {
  if (!token.trim()) throw new Error('A GitHub access token is required')

  return {
    async listInstallations(): Promise<GitHubInstallation[]> {
      const installations: GitHubInstallation[] = []
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const body = requiredRecord(
          await githubRequest(
            fetcher,
            token,
            `/user/installations?per_page=100&page=${page}`,
          ),
          'installation response',
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
        const body = requiredRecord(
          await githubRequest(
            fetcher,
            token,
            `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
          ),
          'repository response',
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
      const body = requiredRecord(
        await githubRequest(
          fetcher,
          token,
          `/search/repositories?${parameters.toString()}`,
        ),
        'search response',
      )
      return (Array.isArray(body.items) ? body.items : []).map(parseRepository)
    },

    async getRepository(
      owner: string,
      repo: string,
    ): Promise<GitHubRepositorySnapshot> {
      const body = requiredRecord(
        await githubRequest(
          fetcher,
          token,
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        ),
        'repository',
      )
      const repositoryOwner = requiredRecord(body.owner, 'repository owner')
      return {
        id: requiredNumber(body.id, 'repository id'),
        owner: requiredString(repositoryOwner.login, 'repository owner login'),
        ownerId: requiredNumber(repositoryOwner.id, 'repository owner id'),
        repo: requiredString(body.name, 'repository name'),
        defaultBranch: requiredString(body.default_branch, 'default branch'),
        private: body.private === true,
      }
    },

    async listBranches(owner: string, repo: string): Promise<string[]> {
      const branches: string[] = []
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const body = await githubRequest(
          fetcher,
          token,
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=${page}`,
        )
        if (!Array.isArray(body)) {
          throw new Error('GitHub returned an invalid branch response')
        }
        branches.push(
          ...body.map((value) =>
            requiredString(requiredRecord(value, 'branch').name, 'branch name'),
          ),
        )
        if (body.length < 100) break
      }
      return branches
    },

    async getFile(
      owner: string,
      repo: string,
      path: string,
      branch: string,
    ): Promise<GitHubFile> {
      const parameters = new URLSearchParams({ ref: branch })
      const body = requiredRecord(
        await githubRequest(
          fetcher,
          token,
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?${parameters.toString()}`,
        ),
        'file response',
      )
      if (body.type !== 'file') throw new Error(`Expected ${path} to be a file`)
      return {
        sha: requiredString(body.sha, 'file sha'),
        content: requiredString(body.content, 'file content'),
      }
    },

    async getDirectory(
      owner: string,
      repo: string,
      branch: string,
      path: string,
    ): Promise<GitHubDirectoryEntry[]> {
      const response = await fetcher(`${GITHUB_API_URL}/graphql`, {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'user-agent': 'pagescms',
        },
        body: JSON.stringify({
          query: `query PagesCmsDirectory($owner: String!, $repo: String!, $expression: String!) {
            repository(owner: $owner, name: $repo) {
              object(expression: $expression) {
                ... on Tree {
                  entries {
                    name
                    path
                    type
                    object {
                      ... on Blob { text oid byteSize }
                    }
                  }
                }
              }
            }
          }`,
          variables: { owner, repo, expression: `${branch}:${path}` },
        }),
      })
      const payload: unknown = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new GitHubApiError(
          `GitHub GraphQL request failed with status ${response.status}`,
          response.status,
        )
      }
      const root = requiredRecord(payload, 'GraphQL response')
      if (Array.isArray(root.errors) && root.errors.length) {
        const first = requiredRecord(root.errors[0], 'GraphQL error')
        throw new GitHubApiError(
          typeof first.message === 'string'
            ? first.message
            : 'GitHub GraphQL request failed',
          400,
        )
      }
      const data = requiredRecord(root.data, 'GraphQL data')
      const repository = requiredRecord(data.repository, 'GraphQL repository')
      if (repository.object === null) return []
      const tree = requiredRecord(repository.object, 'GraphQL tree')
      if (!Array.isArray(tree.entries)) {
        throw new Error('GitHub returned invalid directory entries')
      }
      return tree.entries.map((value): GitHubDirectoryEntry => {
        const entry = requiredRecord(value, 'directory entry')
        const type = entry.type === 'blob' ? 'file' : 'dir'
        const object = isRecord(entry.object) ? entry.object : null
        return {
          type,
          name: requiredString(entry.name, 'entry name'),
          path: requiredString(entry.path, 'entry path'),
          sha: type === 'file' ? requiredString(object?.oid, 'blob sha') : null,
          content:
            type === 'file' && typeof object?.text === 'string'
              ? object.text
              : null,
          size:
            type === 'file' && typeof object?.byteSize === 'number'
              ? object.byteSize
              : null,
        }
      })
    },

    async putFile(input: {
      owner: string
      repo: string
      branch: string
      path: string
      content: string
      message: string
      sha?: string
      committer?: { name: string; email: string }
    }) {
      const body = requiredRecord(
        await githubRequest(
          fetcher,
          token,
          `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${input.path.split('/').map(encodeURIComponent).join('/')}`,
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              message: input.message,
              content: input.content,
              branch: input.branch,
              ...(input.sha ? { sha: input.sha } : {}),
              ...(input.committer ? { committer: input.committer } : {}),
            }),
          },
        ),
        'file update response',
      )
      const content = requiredRecord(body.content, 'updated file')
      const commit = requiredRecord(body.commit, 'file commit')
      return {
        path: requiredString(content.path, 'updated file path'),
        sha: requiredString(content.sha, 'updated file sha'),
        commitSha: requiredString(commit.sha, 'file commit sha'),
      }
    },

    async deleteFile(input: {
      owner: string
      repo: string
      branch: string
      path: string
      sha: string
      message: string
      committer?: { name: string; email: string }
    }) {
      const body = requiredRecord(
        await githubRequest(
          fetcher,
          token,
          `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/contents/${input.path.split('/').map(encodeURIComponent).join('/')}`,
          {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              message: input.message,
              sha: input.sha,
              branch: input.branch,
              ...(input.committer ? { committer: input.committer } : {}),
            }),
          },
        ),
        'file delete response',
      )
      const commit = requiredRecord(body.commit, 'file delete commit')
      return { commitSha: requiredString(commit.sha, 'file delete commit sha') }
    },

    async renameFile(input: {
      owner: string
      repo: string
      branch: string
      path: string
      newPath: string
      sha: string
      message: string
      committer?: { name: string; email: string }
    }) {
      const repositoryPath = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`
      const branchPath = input.branch
        .split('/')
        .map(encodeURIComponent)
        .join('/')
      const reference = requiredRecord(
        await githubRequest(
          fetcher,
          token,
          `${repositoryPath}/git/ref/heads/${branchPath}`,
        ),
        'Git reference',
      )
      const referenceObject = requiredRecord(
        reference.object,
        'Git reference object',
      )
      const headSha = requiredString(referenceObject.sha, 'branch head sha')
      const treeResponse = requiredRecord(
        await githubRequest(
          fetcher,
          token,
          `${repositoryPath}/git/trees/${encodeURIComponent(headSha)}?recursive=1`,
        ),
        'Git tree',
      )
      if (!Array.isArray(treeResponse.tree)) {
        throw new Error('GitHub returned an invalid Git tree')
      }
      const entries = treeResponse.tree.map((value) =>
        requiredRecord(value, 'Git tree entry'),
      )
      const source = entries.find(
        (entry) => entry.path === input.path && entry.type !== 'tree',
      )
      if (!source)
        throw new GitHubApiError(`File not found at ${input.path}`, 404)
      if (requiredString(source.sha, 'Git tree sha') !== input.sha) {
        throw new GitHubApiError('The file changed before it was renamed', 409)
      }
      if (entries.some((entry) => entry.path === input.newPath)) {
        throw new GitHubApiError(`File already exists at ${input.newPath}`, 409)
      }
      const baseTree = requiredString(treeResponse.sha, 'base Git tree sha')
      const sourceMode = requiredString(source.mode, 'Git tree mode')
      const sourceType = requiredString(source.type, 'Git tree type')
      const newTree = requiredRecord(
        await githubRequest(fetcher, token, `${repositoryPath}/git/trees`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            base_tree: baseTree,
            tree: [
              {
                path: input.path,
                mode: sourceMode,
                type: sourceType,
                sha: null,
              },
              {
                path: input.newPath,
                mode: sourceMode,
                type: sourceType,
                sha: input.sha,
              },
            ],
          }),
        }),
        'new Git tree',
      )
      const treeSha = requiredString(newTree.sha, 'new Git tree sha')
      const commit = requiredRecord(
        await githubRequest(fetcher, token, `${repositoryPath}/git/commits`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            message: input.message,
            tree: treeSha,
            parents: [headSha],
            ...(input.committer ? { committer: input.committer } : {}),
          }),
        }),
        'rename commit',
      )
      const commitSha = requiredString(commit.sha, 'rename commit sha')
      await githubRequest(
        fetcher,
        token,
        `${repositoryPath}/git/refs/heads/${branchPath}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sha: commitSha, force: false }),
        },
      )
      return {
        path: input.path,
        newPath: input.newPath,
        sha: input.sha,
        commitSha,
      }
    },
  }
}

export type GitHubApi = ReturnType<typeof createGitHubApi>
