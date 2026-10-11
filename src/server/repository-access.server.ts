import { collaboratorKey } from '#/lib/collaborator-key'
import { and, eq, isNull, or, sql } from 'drizzle-orm'

import {
  accountTable,
  collaboratorTable,
  githubInstallationTokenTable,
} from './database/schema'
import { createGitHubApi, GitHubApiError } from './github-api.server'
import { DEFAULT_REPOSITORY_SOURCE } from './repository-provider.server'
import { createGitHubAppApi } from './github-app.server'
import { decryptSecret, encryptSecret } from './secret-crypto.server'
import { collaboratorApi } from './collaborator-api.server'

import type { Database } from './database/client.server'
import type { GitHubApi, GitHubApiFactory } from './github-api.server'
import type { ProjectUser } from './projects.server'
import type { RuntimeConfiguration } from './runtime-config.server'

export interface RepositoryAccess {
  api: GitHubApi
  source?: string
  tokenSource: 'user' | 'installation'
  collaboratorKey?: string
}

function collaboratorMatches(user: ProjectUser, owner: string, repo: string) {
  return and(
    or(
      eq(collaboratorTable.userId, user.id),
      user.emailVerified === true
        ? and(
            isNull(collaboratorTable.userId),
            sql`lower(${collaboratorTable.email}) = lower(${user.email})`,
          )
        : undefined,
    ),
    sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
    sql`lower(${collaboratorTable.repo}) = lower(${repo})`,
  )
}

export function createRepositoryAccessService(input: {
  database: Database
  cacheDatabase: Database
  githubApp: RuntimeConfiguration['githubApp']
  githubApiFactory?: GitHubApiFactory
}) {
  const {
    database,
    cacheDatabase,
    githubApp,
    githubApiFactory = createGitHubApi,
  } = input
  const resolutions = new Map<string, Promise<RepositoryAccess>>()
  const installationTokens = new Map<number, Promise<string>>()

  async function loadInstallationToken(installationId: number) {
    if (!githubApp) {
      throw new Error(
        'GitHub App credentials are required for collaborator access',
      )
    }
    const cached =
      await cacheDatabase.query.githubInstallationTokenTable.findFirst({
        where: eq(githubInstallationTokenTable.installationId, installationId),
      })
    if (cached && Date.now() < cached.expiresAt.getTime() - 60_000) {
      return decryptSecret(cached.ciphertext, cached.iv, githubApp.cryptoKey)
    }

    const token =
      await createGitHubAppApi(githubApp).createInstallationToken(
        installationId,
      )
    const encrypted = await encryptSecret(token.token, githubApp.cryptoKey)
    await cacheDatabase
      .insert(githubInstallationTokenTable)
      .values({
        ...encrypted,
        installationId,
        expiresAt: token.expiresAt,
      })
      .onConflictDoUpdate({
        target: githubInstallationTokenTable.installationId,
        set: { ...encrypted, expiresAt: token.expiresAt },
      })
    return token.token
  }

  function getInstallationToken(installationId: number) {
    let token = installationTokens.get(installationId)
    if (!token) {
      token = loadInstallationToken(installationId)
      installationTokens.set(installationId, token)
      void token.catch(() => installationTokens.delete(installationId))
    }
    return token
  }

  async function resolveUncached(
    user: ProjectUser,
    owner: string,
    repo: string,
  ) {
    const account = await database.query.accountTable.findFirst({
      columns: { accessToken: true },
      where: and(
        eq(accountTable.userId, user.id),
        eq(accountTable.providerId, 'github'),
      ),
    })
    if (account?.accessToken) {
      const api = githubApiFactory(account.accessToken)
      try {
        await api.getRepository(owner, repo)
        return {
          api,
          source: DEFAULT_REPOSITORY_SOURCE,
          tokenSource: 'user' as const,
        }
      } catch (error) {
        if (
          !(error instanceof GitHubApiError) ||
          ![401, 403, 404].includes(error.status)
        ) {
          throw error
        }
      }
    }

    const collaborators = await database.query.collaboratorTable.findMany({
      columns: { installationId: true, email: true },
      where: collaboratorMatches(user, owner, repo),
    })
    const collaborator = collaborators.at(0)
    if (!collaborator) {
      throw new Error(`You do not have permission to access "${owner}/${repo}"`)
    }
    const token = await getInstallationToken(collaborator.installationId)
    return {
      api: collaboratorApi(githubApiFactory(token)),
      source: DEFAULT_REPOSITORY_SOURCE,
      tokenSource: 'installation' as const,
      collaboratorKey: collaboratorKey(collaborator.email),
    }
  }

  return {
    async forInstallation(installationId: number) {
      return githubApiFactory(await getInstallationToken(installationId))
    },
    resolve(user: ProjectUser, owner: string, repo: string, branch?: string) {
      const key = [
        user.id,
        user.email.toLowerCase(),
        String(user.emailVerified === true),
        owner.toLowerCase(),
        repo.toLowerCase(),
        branch ?? '',
      ].join('\0')
      let resolution = resolutions.get(key)
      if (!resolution) {
        const unscoped = branch
          ? resolutions.get(
              [
                user.id,
                user.email.toLowerCase(),
                String(user.emailVerified === true),
                owner.toLowerCase(),
                repo.toLowerCase(),
                '',
              ].join('\0'),
            )
          : undefined
        resolution = unscoped ? unscoped : resolveUncached(user, owner, repo)
        resolutions.set(key, resolution)
        void resolution.catch(() => resolutions.delete(key))
      }
      return resolution
    },
  }
}

export type RepositoryAccessService = Pick<
  ReturnType<typeof createRepositoryAccessService>,
  'resolve'
>
