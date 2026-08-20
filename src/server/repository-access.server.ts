import { and, eq, isNull, or, sql } from 'drizzle-orm'

import {
  accountTable,
  collaboratorTable,
  githubInstallationTokenTable,
} from './database/schema'
import { createGitHubApi, GitHubApiError } from './github-api.server'
import { createGitHubAppApi } from './github-app.server'
import { decryptSecret, encryptSecret } from './secret-crypto.server'

import type { Database } from './database/client.server'
import type { ProjectUser } from './projects.server'
import type { RuntimeConfiguration } from './runtime-config.server'

export interface RepositoryAccess {
  api: ReturnType<typeof createGitHubApi>
  tokenSource: 'user' | 'installation'
}

function collaboratorMatches(
  user: ProjectUser,
  owner: string,
  repo: string,
  branch?: string,
) {
  return and(
    or(
      eq(collaboratorTable.userId, user.id),
      and(
        isNull(collaboratorTable.userId),
        sql`lower(${collaboratorTable.email}) = lower(${user.email})`,
      ),
    ),
    sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
    sql`lower(${collaboratorTable.repo}) = lower(${repo})`,
    ...(branch
      ? [
          or(
            isNull(collaboratorTable.branch),
            eq(collaboratorTable.branch, branch),
          ),
        ]
      : []),
  )
}

export function createRepositoryAccessService(
  database: Database,
  githubApp: RuntimeConfiguration['githubApp'],
) {
  const resolutions = new Map<string, Promise<RepositoryAccess>>()
  const installationTokens = new Map<number, Promise<string>>()

  async function loadInstallationToken(installationId: number) {
    if (!githubApp) {
      throw new Error(
        'GitHub App credentials are required for collaborator access',
      )
    }
    const cached = await database.query.githubInstallationTokenTable.findFirst({
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
    await database
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
    branch?: string,
  ) {
    const account = await database.query.accountTable.findFirst({
      columns: { accessToken: true },
      where: and(
        eq(accountTable.userId, user.id),
        eq(accountTable.providerId, 'github'),
      ),
    })
    if (account?.accessToken) {
      const api = createGitHubApi(account.accessToken)
      try {
        await api.getRepository(owner, repo)
        return { api, tokenSource: 'user' as const }
      } catch (error) {
        if (
          !(error instanceof GitHubApiError) ||
          ![401, 403, 404].includes(error.status)
        ) {
          throw error
        }
      }
    }

    const collaborator = await database.query.collaboratorTable.findFirst({
      columns: { installationId: true },
      where: collaboratorMatches(user, owner, repo, branch),
    })
    if (!collaborator) {
      throw new Error(`You do not have permission to access "${owner}/${repo}"`)
    }
    const token = await getInstallationToken(collaborator.installationId)
    return { api: createGitHubApi(token), tokenSource: 'installation' as const }
  }

  return {
    resolve(user: ProjectUser, owner: string, repo: string, branch?: string) {
      const key = [
        user.id,
        user.email.toLowerCase(),
        owner.toLowerCase(),
        repo.toLowerCase(),
        branch ?? '',
      ].join('\0')
      let resolution = resolutions.get(key)
      if (!resolution) {
        resolution = resolveUncached(user, owner, repo, branch)
        resolutions.set(key, resolution)
        void resolution.catch(() => resolutions.delete(key))
      }
      return resolution
    },
  }
}

export type RepositoryAccessService = ReturnType<
  typeof createRepositoryAccessService
>
