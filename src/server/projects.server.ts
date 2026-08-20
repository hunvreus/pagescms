import { and, eq, isNull, or, sql } from 'drizzle-orm'

import { createGitHubApi } from './github-api.server'

import type { Database } from './database/client.server'
import type { GitHubInstallation, GitHubRepository } from './github-api.server'

import { accountTable, collaboratorTable } from './database/schema'

export interface ProjectUser {
  id: string
  email: string
  githubUsername: string | null
}

export interface ProjectAccount {
  login: string
  type: 'user' | 'org'
  repositorySelection: 'all' | 'selected'
  installationId: number
}

export interface ProjectRepository {
  owner: string
  repo: string
  private: boolean
  defaultBranch: string | null
  updatedAt: string | null
}

function collaboratorMatchesUser(user: ProjectUser) {
  return or(
    eq(collaboratorTable.userId, user.id),
    and(
      isNull(collaboratorTable.userId),
      sql`lower(${collaboratorTable.email}) = lower(${user.email})`,
    ),
  )
}

function accountKey(account: Pick<ProjectAccount, 'login' | 'installationId'>) {
  return `${account.login.toLowerCase()}::${account.installationId}`
}

function repositoryKey(repository: Pick<ProjectRepository, 'owner' | 'repo'>) {
  return `${repository.owner.toLowerCase()}::${repository.repo.toLowerCase()}`
}

export function mergeProjectAccounts(
  installations: readonly GitHubInstallation[],
  collaborators: readonly ProjectAccount[],
): ProjectAccount[] {
  const accounts = new Map<string, ProjectAccount>()
  for (const installation of installations) {
    const account: ProjectAccount = {
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

export function mergeProjectRepositories(
  githubRepositories: readonly GitHubRepository[],
  collaboratorRepositories: readonly ProjectRepository[],
): ProjectRepository[] {
  const repositories = new Map<string, ProjectRepository>()
  for (const repository of githubRepositories) {
    if (!repository.canPush) continue
    const project: ProjectRepository = {
      owner: repository.owner,
      repo: repository.name,
      private: repository.private,
      defaultBranch: repository.defaultBranch,
      updatedAt: repository.updatedAt,
    }
    repositories.set(repositoryKey(project), project)
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

async function findGitHubToken(database: Database, userId: string) {
  const account = await database.query.accountTable.findFirst({
    columns: { accessToken: true },
    where: and(
      eq(accountTable.userId, userId),
      eq(accountTable.providerId, 'github'),
    ),
  })
  return account?.accessToken ?? null
}

export function createProjectService(database: Database) {
  return {
    async listAccounts(user: ProjectUser): Promise<ProjectAccount[]> {
      const [token, collaboratorRows] = await Promise.all([
        findGitHubToken(database, user.id),
        database
          .selectDistinct({
            login: collaboratorTable.owner,
            type: collaboratorTable.type,
            installationId: collaboratorTable.installationId,
          })
          .from(collaboratorTable)
          .where(collaboratorMatchesUser(user)),
      ])
      const installations =
        token && user.githubUsername
          ? await createGitHubApi(token).listInstallations()
          : []
      const collaboratorAccounts: ProjectAccount[] = collaboratorRows.map(
        (row) => ({
          login: row.login,
          type: row.type === 'user' ? 'user' : 'org',
          repositorySelection: 'selected',
          installationId: row.installationId,
        }),
      )
      return mergeProjectAccounts(installations, collaboratorAccounts)
    },

    async listRepositories(
      user: ProjectUser,
      account: ProjectAccount,
      keyword: string,
    ): Promise<ProjectRepository[]> {
      const [token, collaboratorRows] = await Promise.all([
        findGitHubToken(database, user.id),
        database.query.collaboratorTable.findMany({
          columns: {
            owner: true,
            repo: true,
            branch: true,
          },
          where: and(
            collaboratorMatchesUser(user),
            sql`lower(${collaboratorTable.owner}) = lower(${account.login})`,
          ),
        }),
      ])
      const api = token && user.githubUsername ? createGitHubApi(token) : null
      const githubRepositories = api
        ? account.repositorySelection === 'selected'
          ? await api.listInstallationRepositories(account.installationId)
          : await api.searchRepositories({
              owner: account.login,
              type: account.type,
              keyword,
            })
        : []
      const normalizedKeyword = keyword.trim().toLowerCase()
      const collaboratorRepositories: ProjectRepository[] = collaboratorRows
        .filter(
          (row) =>
            !normalizedKeyword ||
            row.repo.toLowerCase().includes(normalizedKeyword),
        )
        .map((row) => ({
          owner: row.owner,
          repo: row.repo,
          private: true,
          defaultBranch: row.branch,
          updatedAt: null,
        }))
      return mergeProjectRepositories(
        githubRepositories,
        collaboratorRepositories,
      )
    },
  }
}

export type ProjectService = ReturnType<typeof createProjectService>
