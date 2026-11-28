import type { GitHubApiFactory } from '#/server/github/api'
import { and, eq } from 'drizzle-orm'
import { accountTable } from '#/server/db/schema'
import { createRepositoryAccessService as createAccess } from '#/server/access/repository'
import { createRepositoryService as createRepositories } from '../repository/repositories'
import {
  inviteCollaborators as invite,
  listCollaborators as list,
  removeCollaborator as remove,
} from '../collaborators/collaborators'
import type { Database } from '#/server/db/client'
import type { GitHubAccountReader } from '#/server/auth/oauth-account'

// These service fixtures provide credentials directly. The production reader
// has its own encrypted-storage test and never accepts plaintext.
function readFixtureAccount(database: Database): GitHubAccountReader {
  return async (userId) =>
    (await database.query.accountTable.findFirst({
      columns: { id: true, accessToken: true },
      where: and(
        eq(accountTable.userId, userId),
        eq(accountTable.providerId, 'github'),
      ),
    })) ?? null
}

export function createRepositoryAccessService(
  input: Omit<Parameters<typeof createAccess>[0], 'readGitHubAccount'>,
) {
  return createAccess({
    ...input,
    readGitHubAccount: readFixtureAccount(input.database),
  })
}

export function createRepositoryService(
  database: Database,
  cacheDatabase: Database,
  access: Parameters<typeof createRepositories>[2],
  factory?: Parameters<typeof createRepositories>[4],
) {
  return createRepositories(
    database,
    cacheDatabase,
    access,
    readFixtureAccount(database),
    factory,
  )
}

function managerAccess(
  database: Database,
  factory: GitHubApiFactory,
): Parameters<typeof list>[4] {
  return {
    async resolve(user) {
      const token = (await readFixtureAccount(database)(user.id))?.accessToken
      if (!token)
        throw new Error(
          'A GitHub user token is required to manage collaborators',
        )
      return { api: factory(token), tokenSource: 'user' }
    },
  }
}

const fixtureInstallation: NonNullable<Parameters<typeof list>[5]> = async (
  owner,
) => ({
  id: 30,
  account: { login: owner, type: 'Organization' },
})

export function inviteCollaborators(
  input: Omit<Parameters<typeof invite>[0], 'repositoryAccess'> & {
    githubApiFactory: GitHubApiFactory
  },
) {
  return invite({
    ...input,
    repositoryAccess: managerAccess(input.database, input.githubApiFactory),
    installationLookup: input.installationLookup ?? fixtureInstallation,
  })
}

export function removeCollaborator(
  input: Omit<Parameters<typeof remove>[0], 'repositoryAccess'> & {
    githubApiFactory: GitHubApiFactory
  },
) {
  return remove({
    ...input,
    repositoryAccess: managerAccess(input.database, input.githubApiFactory),
    installationLookup: input.installationLookup ?? fixtureInstallation,
  })
}

export function listCollaborators(
  database: Database,
  user: Parameters<typeof list>[1],
  owner: string,
  repo: string,
  factory: GitHubApiFactory,
  lookup?: Parameters<typeof list>[5],
) {
  return list(
    database,
    user,
    owner,
    repo,
    managerAccess(database, factory),
    lookup ?? fixtureInstallation,
  )
}
