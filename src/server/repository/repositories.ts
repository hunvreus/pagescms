import { configurationStoreFor } from '#/server/cache/configuration-access'
import { UserError } from '#/server/http'
import type { GitHubAccountReader } from '#/server/auth/oauth-account'
import {
  admittedConfigurationScope,
  InvalidConfigurationError,
} from '#/server/cache/configuration'
import { observeRepositoryIdentity } from '#/server/access/repository-identity'
import { all } from '#/server/db/sql'

import { createGitHubApi } from '#/server/github/api'
import { recordRepositoryOpened } from './activity'
import { logServerEvent, serverErrorDetails } from '../http'

import type { Database } from '#/server/db/client'
import type {
  GitHubApiFactory,
  GitHubInstallation,
  GitHubRepository,
} from '#/server/github/api'
import type { RepositoryAccessService } from '#/server/access/repository'

export interface RepositoryUser {
  id: string
  email: string
  emailVerified?: boolean
  githubUsername: string | null
}

export interface RepositoryAccount {
  login: string
  type: 'user' | 'org'
  repositorySelection: 'all' | 'selected'
  installationId: number
}

export interface RepositorySummary {
  id?: number
  owner: string
  repo: string
  private: boolean
  defaultBranch: string | null
  updatedAt: string | null
}

const collaboratorMatch =
  'pending = 0 AND (user_id = ? OR (? = 1 AND user_id IS NULL AND lower(email) = lower(?)))'

function accountKey(
  account: Pick<RepositoryAccount, 'login' | 'installationId'>,
) {
  return `${account.login.toLowerCase()}::${account.installationId}`
}

function repositoryKey(
  repository: Pick<RepositorySummary, 'owner' | 'repo' | 'id'>,
) {
  return repository.id === undefined
    ? `${repository.owner.toLowerCase()}::${repository.repo.toLowerCase()}`
    : `github.com:${repository.id}`
}

export function mergeRepositoryAccounts(
  installations: readonly GitHubInstallation[],
  collaborators: readonly RepositoryAccount[],
): RepositoryAccount[] {
  const accounts = new Map<string, RepositoryAccount>()
  for (const installation of installations) {
    const account: RepositoryAccount = {
      login: installation.account.login,
      type: installation.account.type === 'User' ? 'user' : 'org',
      repositorySelection: installation.repositorySelection,
      installationId: installation.id,
    }
    accounts.set(accountKey(account), account)
  }
  for (const account of collaborators) {
    const key = accountKey(account)
    if (!accounts.has(key)) accounts.set(key, account)
  }
  return [...accounts.values()].sort((left, right) =>
    left.login.localeCompare(right.login),
  )
}

export function mergeRepositoryRepositories(
  githubRepositories: readonly GitHubRepository[],
  collaboratorRepositories: readonly RepositorySummary[],
): RepositorySummary[] {
  const repositories = new Map<string, RepositorySummary>()
  for (const repository of githubRepositories) {
    if (!repository.canPush) continue
    const repositoryItem: RepositorySummary = {
      ...(repository.id === undefined ? {} : { id: repository.id }),
      owner: repository.owner,
      repo: repository.name,
      private: repository.private,
      defaultBranch: repository.defaultBranch,
      updatedAt: repository.updatedAt,
    }
    repositories.set(repositoryKey(repositoryItem), repositoryItem)
  }
  for (const repository of collaboratorRepositories) {
    const key = repositoryKey(repository)
    if (!repositories.has(key)) repositories.set(key, repository)
  }
  return [...repositories.values()].sort((left, right) => {
    const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0
    const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0
    return rightTime - leftTime || left.repo.localeCompare(right.repo)
  })
}

export function createRepositoryService(
  database: Database,
  cacheDatabase: Database,
  repositoryAccess: RepositoryAccessService,
  readGitHubAccount: GitHubAccountReader,
  githubApiFactory: GitHubApiFactory = (token) => createGitHubApi(token),
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  return {
    async getAccountAccess(user: RepositoryUser) {
      const [githubAccount, collaboratorRows] = await Promise.all([
        readGitHubAccount(user.id),
        all<{ login: string; type: string; installationId: number }>(
          database,
          `SELECT DISTINCT owner AS login, type, installation_id AS installationId FROM collaborator WHERE ${collaboratorMatch}`,
          [user.id, user.emailVerified === true ? 1 : 0, user.email],
        ),
      ])
      const installations = githubAccount?.accessToken
        ? await githubApiFactory(githubAccount.accessToken).listInstallations()
        : []
      const collaboratorAccounts: RepositoryAccount[] = collaboratorRows.map(
        (row) => ({
          login: row.login,
          type: row.type === 'user' ? 'user' : 'org',
          repositorySelection: 'selected',
          installationId: row.installationId,
        }),
      )
      return {
        accounts: mergeRepositoryAccounts(installations, collaboratorAccounts),
        githubAccountId: githubAccount?.id ?? null,
      }
    },

    async listRepositories(
      user: RepositoryUser,
      account: RepositoryAccount,
      keyword: string,
    ): Promise<RepositorySummary[]> {
      const [githubAccount, collaboratorRows] = await Promise.all([
        readGitHubAccount(user.id),
        all<{ owner: string; repo: string; repoId: number | null }>(
          database,
          `SELECT owner, repo, repo_id AS repoId FROM collaborator WHERE ${collaboratorMatch} AND lower(owner) = lower(?)`,
          [
            user.id,
            user.emailVerified === true ? 1 : 0,
            user.email,
            account.login,
          ],
        ),
      ])
      const api = githubAccount?.accessToken
        ? githubApiFactory(githubAccount.accessToken)
        : null
      const githubRepositories = api
        ? account.repositorySelection === 'selected'
          ? await api.listInstallationRepositories(account.installationId)
          : (
              await api.searchRepositories({
                owner: account.login,
                type: account.type,
                keyword,
              })
            )
              .filter((repository) => repository.canPush)
              .slice(0, 5)
        : []
      const normalizedKeyword = keyword.trim().toLowerCase()
      const collaboratorRepositories: RepositorySummary[] = collaboratorRows
        .filter(
          (row) =>
            !normalizedKeyword ||
            row.repo.toLowerCase().includes(normalizedKeyword),
        )
        .map((row) => ({
          ...(row.repoId === null ? {} : { id: row.repoId }),
          owner: row.owner,
          repo: row.repo,
          private: true,
          defaultBranch: null,
          updatedAt: null,
        }))
      return mergeRepositoryRepositories(
        githubRepositories,
        collaboratorRepositories,
      )
    },

    async createFromTemplate(
      user: RepositoryUser,
      input: {
        installationId: number
        owner: string
        repo: string
        templateOwner: string
        templateRepo: string
      },
    ) {
      const token = (await readGitHubAccount(user.id))?.accessToken
      if (!token) {
        throw new UserError('GitHub authentication is required')
      }
      const api = githubApiFactory(token)
      const installations = await api.listInstallations()
      const installation = installations.find(
        (candidate) =>
          candidate.id === input.installationId &&
          candidate.account.login.toLowerCase() === input.owner.toLowerCase(),
      )
      if (!installation)
        throw new UserError('GitHub installation was not found')
      return api.createRepositoryFromTemplate(input)
    },

    async openRepository(
      user: RepositoryUser,
      owner: string,
      repo: string,
      branch?: string,
      repoId?: string,
    ) {
      const {
        api,
        tokenSource,
        repository: admittedRepository,
        identity: admittedIdentity,
      } = await repositoryAccess.resolve(user, owner, repo, branch, repoId)
      const repositoryPromise = admittedRepository
        ? Promise.resolve(admittedRepository)
        : api.getRepository(owner, repo)
      let configurationInvalid = false
      const configurationPromise = branch
        ? configurationStoreFor(repositoryAccess, cacheDatabase)
            .get(
              api,
              owner,
              repo,
              branch,
              admittedRepository ? String(admittedRepository.id) : undefined,
              admittedRepository &&
                admittedConfigurationScope(admittedIdentity),
            )
            .catch(async (error: unknown) => {
              // Only managers may bootstrap without parsed configuration to repair
              // its source. Content services still reject it; infrastructure errors propagate.
              if (
                error instanceof InvalidConfigurationError &&
                tokenSource === 'user' &&
                (await repositoryPromise).canPush
              ) {
                configurationInvalid = true
                return null
              }
              throw error
            })
        : Promise.resolve(null)
      const [repository, branchExists, configuration] = await Promise.all([
        repositoryPromise,
        !branch || branch === admittedRepository?.defaultBranch
          ? Promise.resolve(true)
          : api.branchExists(owner, repo, branch),
        configurationPromise,
      ])
      // Direct admission already observed this metadata in both stores.
      if (!admittedRepository) {
        await Promise.all(
          [...new Set([database, cacheDatabase])].map((store) =>
            observeRepositoryIdentity(
              store,
              { ...repository, source: api.source },
              { owner, repo },
            ),
          ),
        )
      }
      const opened = recordRepositoryOpened(
        database,
        repository.owner,
        repository.repo,
        admittedIdentity?.externalId === String(repository.id)
          ? admittedIdentity.applicationId
          : undefined,
      )
      if (waitUntil) {
        waitUntil(
          opened.catch((error: unknown) =>
            logServerEvent('error', {
              event: 'repository_opened_record_failed',
              ...serverErrorDetails(error),
            }),
          ),
        )
      } else await opened
      return {
        source: api.source,
        repository,
        branches: [
          ...new Set([
            repository.defaultBranch,
            ...(branchExists && branch ? [branch] : []),
          ]),
        ],
        branch: branch ?? null,
        branchExists,
        configuration,
        configurationInvalid,
      }
    },
  }
}

export type RepositoryService = ReturnType<typeof createRepositoryService>
