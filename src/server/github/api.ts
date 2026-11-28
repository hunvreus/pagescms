import { isRecord } from '#/shared/json'
import { HISTORY_PAGE_SIZE, historyPage } from '#/lib/file-history'
import {
  registerRepositoryReader,
  readRepositoryCached,
  invalidateRepositoryReads,
} from '#/server/cache/repository-read'
import {
  DEFAULT_REPOSITORY_SOURCE,
  RepositoryProviderError,
} from '#/server/repository/provider'

import type {
  RepositoryCommitSummary,
  RepositoryDirectoryEntry,
  RepositoryFile,
} from '#/server/repository/provider'

const GITHUB_API_URL = 'https://api.github.com'

export interface GitHubInstallation {
  id: number
  repositorySelection: 'all' | 'selected'
  account: {
    login: string
    type: 'User' | 'Organization'
  }
}

export interface GitHubRepository {
  id?: number
  ownerId?: number
  owner: string
  name: string
  private: boolean
  defaultBranch: string
  updatedAt: string
  canPush: boolean
}

export interface GitHubRepositorySnapshot {
  id: number
  nodeId?: string
  owner: string
  ownerId: number
  repo: string
  defaultBranch: string
  private: boolean
  canPush: boolean
}

export interface GitHubCreatedRepository {
  owner: string
  repo: string
  defaultBranch: string
}

export type GitHubFile = RepositoryFile
export type GitHubDirectoryEntry = RepositoryDirectoryEntry

export interface GitHubWorkflowRun {
  id: number
  status: string
  conclusion: string | null
  htmlUrl: string | null
  createdAt: string
  updatedAt: string
}

export type GitHubCommitSummary = RepositoryCommitSummary

export class GitHubApiError extends RepositoryProviderError {
  constructor(message: string, status: number, retryAfter?: string) {
    super(message, status, retryAfter)
    this.name = 'GitHubApiError'
  }
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

function commitParent(commit: Record<string, unknown>) {
  const parent = Array.isArray(commit.parents) ? commit.parents[0] : null
  return isRecord(parent) && typeof parent.sha === 'string'
    ? { parentCommitSha: parent.sha }
    : {}
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
    id: requiredNumber(value.id, 'repository id'),
    ownerId: requiredNumber(value.owner.id, 'repository owner id'),
    owner: requiredString(value.owner.login, 'repository owner'),
    name: requiredString(value.name, 'repository name'),
    private: value.private === true,
    defaultBranch: requiredString(value.default_branch, 'default branch'),
    updatedAt: requiredString(value.updated_at, 'updated timestamp'),
    canPush: permissions.push === true,
  }
}

function parseWorkflowRun(value: unknown): GitHubWorkflowRun {
  if (!isRecord(value))
    throw new Error('GitHub returned an invalid workflow run')
  return {
    id: requiredNumber(value.id, 'workflow run id'),
    status:
      typeof value.status === 'string' && value.status
        ? value.status
        : 'queued',
    conclusion: typeof value.conclusion === 'string' ? value.conclusion : null,
    htmlUrl: typeof value.html_url === 'string' ? value.html_url : null,
    createdAt: requiredString(value.created_at, 'workflow run creation time'),
    updatedAt: requiredString(value.updated_at, 'workflow run update time'),
  }
}

function commitDate(commit: Record<string, unknown>) {
  const committer = isRecord(commit.committer) ? commit.committer : {}
  const date = committer.date
  return typeof date === 'string' && Number.isFinite(Date.parse(date))
    ? { commitTimestamp: new Date(date).toISOString() }
    : {}
}

function parseCommit(value: unknown): GitHubCommitSummary {
  const record = requiredRecord(value, 'commit')
  const commit = requiredRecord(record.commit, 'commit metadata')
  const author = isRecord(commit.author) ? commit.author : {}
  const githubAuthor = isRecord(record.author) ? record.author : {}
  return {
    sha: requiredString(record.sha, 'commit sha'),
    url: requiredString(record.html_url, 'commit URL'),
    message: requiredString(commit.message, 'commit message'),
    authorName:
      typeof author.name === 'string' && author.name
        ? author.name
        : typeof githubAuthor.login === 'string'
          ? githubAuthor.login
          : 'Unknown author',
    authorLogin:
      typeof githubAuthor.login === 'string' ? githubAuthor.login : null,
    authoredAt: typeof author.date === 'string' ? author.date : null,
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
    const reset = Number(response.headers.get('x-ratelimit-reset'))
    const retryAfter =
      response.headers.get('retry-after') ??
      (response.headers.get('x-ratelimit-remaining') === '0' &&
      Number.isFinite(reset) &&
      reset > 0
        ? String(Math.max(1, Math.ceil(reset - Date.now() / 1000)))
        : undefined)
    throw new GitHubApiError(message, response.status, retryAfter ?? undefined)
  }
  return body
}

async function readGitTree(
  fetcher: typeof fetch,
  token: string,
  repositoryPath: string,
  sha: string,
) {
  const response = requiredRecord(
    await githubRequest(
      fetcher,
      token,
      `${repositoryPath}/git/trees/${encodeURIComponent(sha)}`,
    ),
    'Git tree',
  )
  if (response.truncated !== false || !Array.isArray(response.tree))
    throw new Error(
      'GitHub returned an incomplete Git tree; this folder cannot be listed completely',
    )
  return {
    sha: requiredString(response.sha, 'Git tree sha'),
    entries: response.tree.map((entry) =>
      requiredRecord(entry, 'Git tree entry'),
    ),
  }
}

export function createGitHubApi(
  token: string,
  fetcher: typeof fetch = fetch,
  repositoryTtlMs = 15_000,
  branchHeadTtlMs = repositoryTtlMs,
  binding?: { id: number; nodeId?: string },
) {
  if (!token.trim()) throw new Error('A GitHub access token is required')
  const repoEndpoint = (owner: string, repo: string) =>
    binding
      ? `/repositories/${binding.id}`
      : `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`

  // Navigation and media delivery read the same short-lived branch snapshot.
  // Mutation callers still use getRefSha directly for a fresh write base.
  const branchHead = (
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string> =>
    readRepositoryCached(
      api,
      owner,
      repo,
      `branch-head:${branch}`,
      branchHeadTtlMs,
      async () => {
        const refPath = branch.split('/').map(encodeURIComponent).join('/')
        const body = requiredRecord(
          await githubRequest(
            fetcher,
            token,
            `${repoEndpoint(owner, repo)}/git/ref/heads/${refPath}`,
          ),
          'Git branch',
        )
        return requiredString(
          requiredRecord(body.object, 'Git branch object').sha,
          'Git branch sha',
        )
      },
      (error) => error instanceof GitHubApiError && error.status === 404,
    )

  const mediaRevision = (
    owner: string,
    repo: string,
    ref: string,
  ): Promise<string> =>
    /^[a-f0-9]{40}$/i.test(ref)
      ? Promise.resolve(ref)
      : branchHead(owner, repo, ref).catch((error) => {
          if (!(error instanceof GitHubApiError) || error.status !== 404)
            throw error
          // Provider callers may also resolve tags; branch navigation must not.
          return api.getRefSha(owner, repo, ref)
        })

  async function blobText(
    owner: string,
    repo: string,
    blob: Record<string, unknown>,
  ) {
    if (typeof blob.text !== 'string') return null
    if (blob.isTruncated !== true) return blob.text
    // Read the same immutable blob, never a branch that could have moved.
    const sha = requiredString(blob.oid, 'blob sha')
    const full = requiredRecord(
      await githubRequest(
        fetcher,
        token,
        `${repoEndpoint(owner, repo)}/git/blobs/${encodeURIComponent(sha)}`,
      ),
      'Git blob',
    )
    if (full.encoding !== 'base64')
      throw new Error('GitHub returned an unsupported blob encoding')
    const bytes = Uint8Array.from(
      atob(requiredString(full.content, 'blob content').replace(/\s/g, '')),
      (character) => character.charCodeAt(0),
    )
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }

  async function directory(
    owner: string,
    repo: string,
    revision: string,
    path: string,
    snapshot: boolean,
  ): Promise<{
    revision: string | null
    entries: GitHubDirectoryEntry[]
    missing?: boolean
  }> {
    if (binding && !binding.nodeId)
      throw new Error('GitHub repository node ID is unavailable')
    const entries = `entries { name path type object { ... on Blob { text isTruncated oid byteSize } } }`
    const selection = snapshot
      ? path
        ? `object(expression: $expression) { ... on Commit { oid file(path: $path) { object { ... on Tree { ${entries} } } } } }`
        : `object(expression: $expression) { ... on Commit { oid tree { ${entries} } } }`
      : `object(expression: $expression) { ... on Tree { ${entries} } }`
    const response = await fetcher(`${GITHUB_API_URL}/graphql`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'pagescms',
      },
      body: JSON.stringify({
        query: `query PagesCmsDirectory(${binding ? '$nodeId: ID!' : '$owner: String!, $repo: String!'}, $expression: String!${snapshot && path ? ', $path: String!' : ''}) {
          ${binding ? 'repository: node(id: $nodeId) { ... on Repository {' : 'repository(owner: $owner, name: $repo) {'}
            ${selection}
          ${binding ? '} }' : '}'}
        }`,
        variables: {
          ...(binding ? { nodeId: binding.nodeId } : { owner, repo }),
          expression: snapshot
            ? `refs/heads/${revision}`
            : `${revision}:${path}`,
          ...(snapshot && path ? { path } : {}),
        },
      }),
    })
    const payload: unknown = await response.json().catch(() => ({}))
    if (!response.ok)
      throw new GitHubApiError(
        `GitHub GraphQL request failed with status ${response.status}`,
        response.status,
      )
    const root = requiredRecord(payload, 'GraphQL response')
    if (Array.isArray(root.errors) && root.errors.length) {
      const missingDirectory =
        snapshot &&
        path &&
        root.errors.every(
          (error) =>
            isRecord(error) &&
            error.message === `Could not resolve file for path '${path}'.` &&
            Array.isArray(error.path) &&
            error.path.join('.') === 'repository.object.file',
        ) &&
        isRecord(root.data) &&
        isRecord(root.data.repository) &&
        isRecord(root.data.repository.object) &&
        root.data.repository.object.file === null
      if (!missingDirectory) {
        const first = requiredRecord(root.errors[0], 'GraphQL error')
        throw new GitHubApiError(
          typeof first.message === 'string'
            ? first.message
            : 'GitHub GraphQL request failed',
          400,
        )
      }
    }
    const data = requiredRecord(root.data, 'GraphQL data')
    const repository = requiredRecord(data.repository, 'GraphQL repository')
    if (repository.object === null) {
      if (snapshot) throw new GitHubApiError('Git branch not found', 404)
      return { revision: null, entries: [] }
    }
    const object = requiredRecord(
      repository.object,
      snapshot ? 'Git branch commit' : 'GraphQL tree',
    )
    const commit = snapshot
      ? requiredString(object.oid, 'Git branch sha')
      : null
    const treeValue = snapshot
      ? path
        ? object.file === null
          ? null
          : requiredRecord(object.file, 'directory entry').object
        : object.tree
      : object
    if (treeValue === null)
      return { revision: commit, entries: [], missing: true }
    const tree = requiredRecord(treeValue, 'GraphQL tree')
    if (!Array.isArray(tree.entries))
      throw new Error('GitHub returned invalid directory entries')
    const result: GitHubDirectoryEntry[] = []
    for (const value of tree.entries) {
      const entry = requiredRecord(value, 'directory entry')
      const type = entry.type === 'blob' ? 'file' : 'dir'
      const blob = isRecord(entry.object) ? entry.object : null
      result.push({
        type,
        name: requiredString(entry.name, 'entry name'),
        path: requiredString(entry.path, 'entry path'),
        sha: type === 'file' ? requiredString(blob?.oid, 'blob sha') : null,
        content:
          type === 'file' && typeof blob?.text === 'string' ? blob.text : null,
        size:
          type === 'file' && typeof blob?.byteSize === 'number'
            ? blob.byteSize
            : null,
        downloadUrl: null,
      })
    }
    return { revision: commit, entries: result }
  }

  const api = {
    source: DEFAULT_REPOSITORY_SOURCE,
    async listInstallations(): Promise<GitHubInstallation[]> {
      const installations: GitHubInstallation[] = []
      for (let page = 1; ; page += 1) {
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
      for (let page = 1; ; page += 1) {
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
      const parameters = new URLSearchParams({
        q: `${input.keyword.trim()} in:name ${input.type}:${input.owner} fork:true`,
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

    async createRepositoryFromTemplate(input: {
      templateOwner: string
      templateRepo: string
      owner: string
      repo: string
    }): Promise<GitHubCreatedRepository> {
      const body = requiredRecord(
        await githubRequest(
          fetcher,
          token,
          `/repos/${encodeURIComponent(input.templateOwner)}/${encodeURIComponent(input.templateRepo)}/generate`,
          {
            method: 'POST',
            body: JSON.stringify({ owner: input.owner, name: input.repo }),
          },
        ),
        'created repository',
      )
      const owner = requiredRecord(body.owner, 'created repository owner')
      return {
        owner: requiredString(owner.login, 'created repository owner login'),
        repo: requiredString(body.name, 'created repository name'),
        defaultBranch: requiredString(
          body.default_branch,
          'created repository default branch',
        ),
      }
    },

    async getRepository(
      owner: string,
      repo: string,
      _options?: { fresh?: boolean },
    ): Promise<GitHubRepositorySnapshot> {
      const body = requiredRecord(
        await githubRequest(fetcher, token, `${repoEndpoint(owner, repo)}`),
        'repository',
      )
      const repositoryOwner = requiredRecord(body.owner, 'repository owner')
      return {
        id: requiredNumber(body.id, 'repository id'),
        ...(typeof body.node_id === 'string' && body.node_id
          ? { nodeId: body.node_id }
          : {}),
        owner: requiredString(repositoryOwner.login, 'repository owner login'),
        ownerId: requiredNumber(repositoryOwner.id, 'repository owner id'),
        repo: requiredString(body.name, 'repository name'),
        defaultBranch: requiredString(body.default_branch, 'default branch'),
        private: body.private === true,
        canPush: isRecord(body.permissions) && body.permissions.push === true,
      }
    },

    async listBranches(owner: string, repo: string): Promise<string[]> {
      const branches: string[] = []
      for (let page = 1; ; page += 1) {
        const body = await githubRequest(
          fetcher,
          token,
          `${repoEndpoint(owner, repo)}/branches?per_page=100&page=${page}`,
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

    async branchExists(owner: string, repo: string, branch: string) {
      try {
        await branchHead(owner, repo, branch)
        return true
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404)
          return false
        throw error
      }
    },

    async createBranch(
      owner: string,
      repo: string,
      branch: string,
      source: string,
    ) {
      const repositoryPath = `${repoEndpoint(owner, repo)}`
      const sourcePath = source.split('/').map(encodeURIComponent).join('/')
      const sourceRef = requiredRecord(
        await githubRequest(
          fetcher,
          token,
          `${repositoryPath}/git/ref/heads/${sourcePath}`,
        ),
        'source branch',
      )
      const sourceObject = requiredRecord(
        sourceRef.object,
        'source branch object',
      )
      const sha = requiredString(sourceObject.sha, 'source branch sha')
      const body = requiredRecord(
        await githubRequest(fetcher, token, `${repositoryPath}/git/refs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
        }),
        'new branch',
      )
      const object = requiredRecord(body.object, 'new branch object')
      return {
        branch,
        sha: requiredString(object.sha, 'new branch sha'),
      }
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
          `${repoEndpoint(owner, repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?${parameters.toString()}`,
        ),
        'file response',
      )
      if (body.type !== 'file') throw new Error(`Expected ${path} to be a file`)
      const sha = requiredString(body.sha, 'file sha')
      let content =
        typeof body.content === 'string' &&
        (body.content || (body.size === 0 && body.encoding === 'base64'))
          ? body.content
          : null
      if (content === null) {
        const blob = requiredRecord(
          await githubRequest(
            fetcher,
            token,
            `${repoEndpoint(owner, repo)}/git/blobs/${encodeURIComponent(sha)}`,
          ),
          'blob response',
        )
        if (blob.encoding !== 'base64') {
          throw new Error('GitHub returned an unsupported blob encoding')
        }
        content =
          blob.size === 0 && blob.content === ''
            ? ''
            : requiredString(blob.content, 'blob content')
      }
      return {
        sha,
        content,
      }
    },

    async getFileResponse(
      owner: string,
      repo: string,
      path: string,
      branch: string,
      ifNoneMatch?: string,
    ) {
      const query = new URLSearchParams({ ref: branch })
      const response = await fetcher(
        `${GITHUB_API_URL}${repoEndpoint(owner, repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?${query}`,
        {
          headers: {
            accept: 'application/vnd.github.raw',
            authorization: `Bearer ${token}`,
            'user-agent': 'pagescms',
            'x-github-api-version': '2022-11-28',
            ...(ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {}),
          },
        },
      )
      if (response.status !== 304 && !response.ok) {
        await response.body?.cancel()
        throw new GitHubApiError(
          `GitHub media request failed with status ${response.status}`,
          response.status,
          response.headers.get('retry-after') ?? undefined,
        )
      }
      return response
    },

    async getFiles(
      owner: string,
      repo: string,
      revision: string,
      paths: string[],
      includeContent = true,
      allowTruncated = false,
    ): Promise<GitHubDirectoryEntry[]> {
      const uniquePaths = [...new Set(paths)]
      const entries: GitHubDirectoryEntry[] = []
      for (let offset = 0; offset < uniquePaths.length; offset += 50) {
        const chunk = uniquePaths.slice(offset, offset + 50)
        if (binding && !binding.nodeId)
          throw new Error('GitHub repository node ID is unavailable')
        const variables: Record<string, string> = binding
          ? { nodeId: binding.nodeId! }
          : { owner, repo }
        chunk.forEach((path, index) => {
          variables[`exp${index}`] = `${revision}:${path}`
        })
        const response = await fetcher(`${GITHUB_API_URL}/graphql`, {
          method: 'POST',
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'user-agent': 'pagescms',
          },
          body: JSON.stringify({
            query: `query PagesCmsChangedFiles(${binding ? '$nodeId: ID!' : '$owner: String!, $repo: String!'}, ${chunk.map((_, i) => `$exp${i}: String!`).join(', ')}) {
              ${binding ? 'repository: node(id: $nodeId) { ... on Repository {' : 'repository(owner: $owner, name: $repo) {'}
                ${chunk.map((_, i) => `file${i}: object(expression: $exp${i}) { ... on Blob { oid byteSize ${includeContent ? 'text isTruncated' : ''} } }`).join('\n')}
              ${binding ? '} }' : '}'}
            }`,
            variables,
          }),
        })
        const payload = requiredRecord(
          await response.json().catch(() => ({})),
          'GraphQL response',
        )
        if (
          !response.ok ||
          (Array.isArray(payload.errors) && payload.errors.length)
        ) {
          const first = Array.isArray(payload.errors) ? payload.errors[0] : null
          throw new GitHubApiError(
            isRecord(first) && typeof first.message === 'string'
              ? first.message
              : 'Could not retrieve changed files',
            response.ok ? 400 : response.status,
          )
        }
        const repository = requiredRecord(
          requiredRecord(payload.data, 'GraphQL data').repository,
          'GraphQL repository',
        )
        for (const [index, path] of chunk.entries()) {
          const blob = repository[`file${index}`]
          // Missing/non-blob paths require directory reconciliation; never invent a deletion.
          if (blob === null || (isRecord(blob) && !blob.oid)) continue
          const file = requiredRecord(blob, 'GraphQL blob')
          entries.push({
            type: 'file',
            name: path.slice(path.lastIndexOf('/') + 1),
            path,
            sha: requiredString(file.oid, 'blob sha'),
            size: typeof file.byteSize === 'number' ? file.byteSize : null,
            content: !includeContent
              ? null
              : allowTruncated
                ? typeof file.text === 'string'
                  ? file.text
                  : null
                : await blobText(owner, repo, file),
            downloadUrl: null,
          })
        }
      }
      return entries
    },

    async getDirectory(
      owner: string,
      repo: string,
      branch: string,
      path: string,
      nodeFilename?: string,
    ): Promise<GitHubDirectoryEntry[]> {
      const { entries } = await directory(owner, repo, branch, path, false)
      const directories = entries.filter((entry) => entry.type === 'dir')
      if (!nodeFilename || directories.length === 0) return entries

      entries.push(
        ...(await api.getFiles(
          owner,
          repo,
          branch,
          directories.map(
            (parentDirectory) => `${parentDirectory.path}/${nodeFilename}`,
          ),
          true,
          true,
        )),
      )
      return entries
    },

    async getDirectorySnapshot(
      owner: string,
      repo: string,
      branch: string,
      path: string,
    ) {
      const result = await directory(owner, repo, branch, path, true)
      return {
        revision: result.revision!,
        entries: result.entries,
        missing: result.missing,
      }
    },

    async getMediaDirectory(
      owner: string,
      repo: string,
      branch: string,
      path: string,
    ): Promise<GitHubDirectoryEntry[]> {
      const revision = await mediaRevision(owner, repo, branch)
      const parameters = new URLSearchParams({ ref: revision })
      let body: unknown
      try {
        body = await githubRequest(
          fetcher,
          token,
          `${repoEndpoint(owner, repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?${parameters.toString()}`,
        )
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) return []
        throw error
      }
      if (!Array.isArray(body)) {
        throw new Error(`Expected ${path} to be a directory`)
      }
      const entries = body.map((value): GitHubDirectoryEntry => {
        const entry = requiredRecord(value, 'media directory entry')
        const type = entry.type === 'dir' ? 'dir' : 'file'
        return {
          type,
          revision,
          name: requiredString(entry.name, 'entry name'),
          path: requiredString(entry.path, 'entry path'),
          sha: type === 'file' ? requiredString(entry.sha, 'blob sha') : null,
          content: null,
          size:
            type === 'file' && typeof entry.size === 'number'
              ? entry.size
              : null,
          downloadUrl:
            type === 'file' && typeof entry.download_url === 'string'
              ? entry.download_url
              : null,
        }
      })
      if (entries.length < 1000) return entries

      // Contents is not paginated. Walk non-recursive trees only when it reaches
      // its limit; retain URL capabilities only for the exact same blob version.
      const repositoryPath = `${repoEndpoint(owner, repo)}`
      let tree = await readGitTree(fetcher, token, repositoryPath, revision)
      for (const segment of path.split('/').filter(Boolean)) {
        const child = tree.entries.find(
          (entry) => entry.path === segment && entry.type === 'tree',
        )
        if (!child) return []
        tree = await readGitTree(
          fetcher,
          token,
          repositoryPath,
          requiredString(child.sha, 'tree sha'),
        )
      }
      const urls = new Map(entries.map((entry) => [entry.path, entry]))
      return tree.entries.flatMap((entry): GitHubDirectoryEntry[] => {
        if (entry.type !== 'blob' && entry.type !== 'tree') return []
        const name = requiredString(entry.path, 'tree entry path')
        if (name.includes('/') || name === '.' || name === '..')
          throw new Error('Invalid immediate tree entry')
        const fullPath = [path, name].filter(Boolean).join('/')
        const sha =
          entry.type === 'blob' ? requiredString(entry.sha, 'blob sha') : null
        const previous = urls.get(fullPath)
        return [
          {
            type: entry.type === 'tree' ? 'dir' : 'file',
            revision,
            name,
            path: fullPath,
            sha,
            size:
              entry.type === 'blob' && typeof entry.size === 'number'
                ? entry.size
                : null,
            content: null,
            downloadUrl:
              sha && previous?.sha === sha ? previous.downloadUrl : null,
          },
        ]
      })
    },

    async getFileDownloadUrl(
      owner: string,
      repo: string,
      revision: string,
      path: string,
    ): Promise<RepositoryDirectoryEntry | null> {
      revision = await mediaRevision(owner, repo, revision)
      let body: Record<string, unknown>
      try {
        body = requiredRecord(
          await githubRequest(
            fetcher,
            token,
            `${repoEndpoint(owner, repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?${new URLSearchParams({ ref: revision })}`,
          ),
          'media file',
        )
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) return null
        throw error
      }
      if (body.type !== 'file' || typeof body.download_url !== 'string')
        return null
      return {
        type: 'file',
        name: requiredString(body.name, 'file name'),
        path: requiredString(body.path, 'file path'),
        sha: requiredString(body.sha, 'blob sha'),
        size: typeof body.size === 'number' ? body.size : null,
        content: null,
        downloadUrl: body.download_url,
      }
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
          `${repoEndpoint(input.owner, input.repo)}/contents/${input.path.split('/').map(encodeURIComponent).join('/')}`,
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
        ...commitParent(commit),
        ...commitDate(commit),
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
          `${repoEndpoint(input.owner, input.repo)}/contents/${input.path.split('/').map(encodeURIComponent).join('/')}`,
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
      return {
        commitSha: requiredString(commit.sha, 'file delete commit sha'),
        ...commitParent(commit),
        ...commitDate(commit),
      }
    },

    async renameFile(input: {
      expectedHead?: string
      moves?: { path: string; newPath: string; sha: string }[]
      owner: string
      repo: string
      branch: string
      path: string
      newPath: string
      sha: string
      message: string
      committer?: { name: string; email: string }
    }) {
      const repositoryPath = `${repoEndpoint(input.owner, input.repo)}`
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
      if (input.expectedHead && input.expectedHead !== headSha)
        throw new GitHubApiError(
          'The translation group changed; review the rename again',
          409,
        )
      const trees = new Map<
        string,
        { sha: string; entries: Record<string, unknown>[] }
      >()
      async function readTree(sha: string) {
        const cached = trees.get(sha)
        if (cached) return cached
        const tree = await readGitTree(fetcher, token, repositoryPath, sha)
        trees.set(sha, tree)
        return tree
      }
      const root = await readTree(headSha)
      // Walk only the two paths; a recursive repository tree can be truncated.
      async function findEntry(path: string) {
        const segments = path.split('/')
        let tree = root
        for (const [index, segment] of segments.entries()) {
          const entry = tree.entries.find(
            (candidate) => candidate.path === segment,
          )
          if (!entry || index === segments.length - 1) return entry
          if (entry.type !== 'tree')
            throw new GitHubApiError(`A file blocks the path ${path}`, 409)
          tree = await readTree(requiredString(entry.sha, 'Git tree sha'))
        }
        return undefined
      }
      const moves = input.moves ?? [
        { path: input.path, newPath: input.newPath, sha: input.sha },
      ]
      if (
        !moves.length ||
        moves.length > 50 ||
        new Set(moves.flatMap((move) => [move.path, move.newPath])).size !==
          moves.length * 2
      )
        throw new Error('Invalid atomic rename plan')
      const treeEntries: {
        path: string
        mode: string
        type: string
        sha: string | null
      }[] = []
      for (const move of moves) {
        const source = await findEntry(move.path)
        if (!source || source.type !== 'blob')
          throw new GitHubApiError(`File not found at ${move.path}`, 404)
        if (requiredString(source.sha, 'Git tree sha') !== move.sha)
          throw new GitHubApiError(
            'A translation changed before it was renamed',
            409,
          )
        if (await findEntry(move.newPath))
          throw new GitHubApiError(
            `File already exists at ${move.newPath}`,
            409,
          )
        const mode = requiredString(source.mode, 'Git tree mode')
        treeEntries.push(
          { path: move.path, mode, type: 'blob', sha: null },
          { path: move.newPath, mode, type: 'blob', sha: move.sha },
        )
      }
      const baseTree = root.sha
      const newTree = requiredRecord(
        await githubRequest(fetcher, token, `${repositoryPath}/git/trees`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            base_tree: baseTree,
            tree: treeEntries,
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
        parentCommitSha: headSha,
        ...commitDate(commit),
      }
    },

    getBranchHead: branchHead,

    async getRefSha(owner: string, repo: string, ref: string) {
      if (/^[a-f0-9]{40}$/i.test(ref)) return ref
      const repositoryPath = `${repoEndpoint(owner, repo)}`
      const refPath = ref.split('/').map(encodeURIComponent).join('/')
      for (const namespace of ['heads', 'tags']) {
        try {
          const body = requiredRecord(
            await githubRequest(
              fetcher,
              token,
              `${repositoryPath}/git/ref/${namespace}/${refPath}`,
            ),
            'Git reference',
          )
          return requiredString(
            requiredRecord(body.object, 'Git reference object').sha,
            'Git reference sha',
          )
        } catch (error) {
          if (!(error instanceof GitHubApiError) || error.status !== 404)
            throw error
        }
      }
      throw new GitHubApiError(`Git reference ${ref} was not found`, 404)
    },

    async dispatchWorkflow(input: {
      owner: string
      repo: string
      workflow: string
      ref: string
      inputs: Record<string, string>
    }) {
      await githubRequest(
        fetcher,
        token,
        `${repoEndpoint(input.owner, input.repo)}/actions/workflows/${encodeURIComponent(input.workflow)}/dispatches`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ref: input.ref, inputs: input.inputs }),
        },
      )
    },

    async listWorkflowRuns(input: {
      owner: string
      repo: string
      workflow: string
      ref: string
    }) {
      const query = new URLSearchParams({
        branch: input.ref,
        event: 'workflow_dispatch',
        per_page: '10',
      })
      const body = requiredRecord(
        await githubRequest(
          fetcher,
          token,
          `${repoEndpoint(input.owner, input.repo)}/actions/workflows/${encodeURIComponent(input.workflow)}/runs?${query}`,
        ),
        'workflow runs',
      )
      return (Array.isArray(body.workflow_runs) ? body.workflow_runs : []).map(
        parseWorkflowRun,
      )
    },

    async getWorkflowRun(owner: string, repo: string, runId: number) {
      return parseWorkflowRun(
        await githubRequest(
          fetcher,
          token,
          `${repoEndpoint(owner, repo)}/actions/runs/${runId}`,
        ),
      )
    },

    async cancelWorkflowRun(owner: string, repo: string, runId: number) {
      await githubRequest(
        fetcher,
        token,
        `${repoEndpoint(owner, repo)}/actions/runs/${runId}/cancel`,
        { method: 'POST' },
      )
    },

    async listFileCommits(
      owner: string,
      repo: string,
      branch: string,
      path: string,
      page = 1,
    ) {
      const query = new URLSearchParams({
        sha: branch,
        path,
        per_page: String(HISTORY_PAGE_SIZE),
        page: String(historyPage(page)),
      })
      const body = await githubRequest(
        fetcher,
        token,
        `${repoEndpoint(owner, repo)}/commits?${query}`,
      )
      if (!Array.isArray(body))
        throw new Error('GitHub returned invalid commits')
      return body.map(parseCommit)
    },
  }
  registerRepositoryReader(api, token)
  const repository = api.getRepository
  const branches = api.listBranches
  api.getRepository = async (owner, repo, options) => {
    if (options?.fresh) {
      // A fresh check supersedes cached permissions. Clear again on completion
      // so a concurrent read cannot repopulate stale metadata during the check.
      invalidateRepositoryReads(owner, repo, DEFAULT_REPOSITORY_SOURCE)
      try {
        return await repository(owner, repo)
      } finally {
        invalidateRepositoryReads(owner, repo, DEFAULT_REPOSITORY_SOURCE)
      }
    }
    return readRepositoryCached(
      api,
      owner,
      repo,
      'repository',
      repositoryTtlMs,
      () => repository(owner, repo),
      (error) =>
        error instanceof GitHubApiError && [401, 404].includes(error.status),
    )
  }
  api.listBranches = (owner, repo) =>
    readRepositoryCached(api, owner, repo, 'branches', repositoryTtlMs, () =>
      branches(owner, repo),
    )
  const createBranch = api.createBranch
  api.createBranch = async (...args) => {
    const result = await createBranch(...args)
    invalidateRepositoryReads(args[0], args[1], DEFAULT_REPOSITORY_SOURCE)
    return result
  }
  return api
}

export type GitHubApi = ReturnType<typeof createGitHubApi>
export type GitHubApiFactory = (
  token: string,
  repository?: { id: number; nodeId?: string },
) => GitHubApi
