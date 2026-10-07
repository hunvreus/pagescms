export const DEFAULT_REPOSITORY_SOURCE = 'github.com'

export type RepositorySource = string

export interface RepositoryFile {
  sha: string
  content: string
}

export interface RepositoryDirectoryEntry {
  type: 'file' | 'dir'
  name: string
  path: string
  sha: string | null
  content: string | null
  size: number | null
  downloadUrl: string | null
}

export interface RepositoryCommitSummary {
  sha: string
  url: string
  message: string
  authorName: string
  authorLogin: string | null
  authoredAt: string | null
}

export interface RepositoryMetadata {
  owner: string
  repo: string
  defaultBranch: string
  private: boolean
  canPush: boolean
}

export interface RepositoryWorkflowRun {
  id: number
  status: string
  conclusion: string | null
  htmlUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface RepositoryApi {
  /** Stable namespace for cache isolation, such as github.com or a local checkout id. */
  readonly source: RepositorySource
  getRepository: (owner: string, repo: string) => Promise<RepositoryMetadata>
  listBranches: (owner: string, repo: string) => Promise<string[]>
  createBranch: (
    owner: string,
    repo: string,
    branch: string,
    source: string,
  ) => Promise<{ branch: string; sha: string }>
  getFile: (
    owner: string,
    repo: string,
    path: string,
    revision: string,
  ) => Promise<RepositoryFile>
  getFileResponse?: (
    owner: string,
    repo: string,
    path: string,
    revision: string,
    ifNoneMatch?: string,
  ) => Promise<Response>
  getFiles: (
    owner: string,
    repo: string,
    revision: string,
    paths: string[],
    includeContent?: boolean,
  ) => Promise<RepositoryDirectoryEntry[]>
  getDirectory: (
    owner: string,
    repo: string,
    revision: string,
    path: string,
    nodeFilename?: string,
  ) => Promise<RepositoryDirectoryEntry[]>
  getMediaDirectory: (
    owner: string,
    repo: string,
    revision: string,
    path: string,
  ) => Promise<RepositoryDirectoryEntry[]>
  getRefSha: (owner: string, repo: string, ref: string) => Promise<string>
  putFile: (input: {
    owner: string
    repo: string
    branch: string
    path: string
    content: string
    message: string
    sha?: string
    committer?: { name: string; email: string }
  }) => Promise<{
    path: string
    sha: string
    commitSha: string
    parentCommitSha?: string
  }>
  deleteFile: (input: {
    owner: string
    repo: string
    branch: string
    path: string
    sha: string
    message: string
    committer?: { name: string; email: string }
  }) => Promise<{ commitSha: string; parentCommitSha?: string }>
  renameFile: (input: {
    owner: string
    repo: string
    branch: string
    path: string
    newPath: string
    sha: string
    message: string
    committer?: { name: string; email: string }
  }) => Promise<{
    path: string
    newPath: string
    sha: string
    commitSha: string
    parentCommitSha: string
  }>
  listFileCommits: (
    owner: string,
    repo: string,
    branch: string,
    path: string,
  ) => Promise<RepositoryCommitSummary[]>
  dispatchWorkflow: (input: {
    owner: string
    repo: string
    workflow: string
    ref: string
    inputs: Record<string, string>
  }) => Promise<void>
  listWorkflowRuns: (input: {
    owner: string
    repo: string
    workflow: string
    ref: string
  }) => Promise<RepositoryWorkflowRun[]>
  getWorkflowRun: (
    owner: string,
    repo: string,
    runId: number,
  ) => Promise<RepositoryWorkflowRun>
  cancelWorkflowRun: (
    owner: string,
    repo: string,
    runId: number,
  ) => Promise<void>
}

export class RepositoryProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: string,
  ) {
    super(message)
    this.name = 'RepositoryProviderError'
  }
}

export function isRepositoryProviderError(
  error: unknown,
  ...statuses: number[]
) {
  return (
    error instanceof RepositoryProviderError &&
    (!statuses.length || statuses.includes(error.status))
  )
}

export function repositorySource(api: Pick<RepositoryApi, 'source'> | object) {
  return 'source' in api && typeof api.source === 'string' && api.source
    ? api.source
    : DEFAULT_REPOSITORY_SOURCE
}

export interface RepositoryAccess {
  api: RepositoryApi
  source: RepositorySource
  credentialSource: string
}

export interface RepositoryAccessProvider<TUser> {
  readonly id: string
  resolve: (
    user: TUser,
    owner: string,
    repo: string,
    branch?: string,
  ) => Promise<RepositoryAccess>
}
