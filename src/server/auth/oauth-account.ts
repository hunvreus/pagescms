import { decryptOAuthToken } from '#/server/auth/oauth-token-crypto'
import type { Database } from '#/server/db/client'
import type { ConfigurationRow } from '#/server/cache/configuration'
import { first } from '#/server/db/sql'

export type GitHubAccountReader = (
  userId: string,
  repository?: { owner: string; repo: string; branch?: string },
) => Promise<{
  id: string
  accessToken: string | null
  repositoryIdentity?: {
    id: number
    source: string
    externalId: string | null
    ownerId: string | null
    owner: string
    repo: string
    configuration?: { branch: string; row: ConfigurationRow | null }
  }
} | null>

export function createGitHubAccountReader(
  database: Database,
  secret: string,
): GitHubAccountReader {
  return async (userId, repository) => {
    const account = await first<{
      id: string
      accessToken: string | null
      repositoryId?: number | null
      repositorySource?: string
      repositoryExternalId?: string | null
      repositoryOwnerId?: string | null
      repositoryOwner?: string
      repositoryName?: string
      configRepositoryId?: number | null
      configSource?: string
      configOwner?: string
      configRepo?: string
      configSha?: string
      configVersion?: string
      configObject?: string
      configCheckedAt?: number
    }>(
      database,
      `SELECT account.id, account.access_token AS accessToken${
        repository
          ? `,
        r.id AS repositoryId, r.source AS repositorySource,
        r.external_id AS repositoryExternalId, r.owner_id AS repositoryOwnerId,
        r.owner AS repositoryOwner, r.repo AS repositoryName,
        c.repository_id AS configRepositoryId, c.source AS configSource,
        c.owner AS configOwner, c.repo AS configRepo, c.sha AS configSha,
        c.version AS configVersion, c.object AS configObject, c.last_checked_at AS configCheckedAt`
          : ''
      }
       FROM account INDEXED BY idx_account_userId${
         repository
           ? `
       LEFT JOIN repository_address a ON a.source = 'github.com' AND a.owner = ? AND a.repo = ?
       LEFT JOIN repository r ON r.id = a.repository_id
       LEFT JOIN config c ON c.repository_id = r.id AND c.source = r.source AND c.branch = ?`
           : ''
       }
       WHERE account.user_id = ? AND account.provider_id = 'github'
       ORDER BY account.created_at ASC, account.id ASC LIMIT 1`,
      repository
        ? [
            repository.owner.toLowerCase(),
            repository.repo.toLowerCase(),
            repository.branch ?? null,
            userId,
          ]
        : [userId],
    )
    if (!account) return null
    const repositoryIdentity =
      account.repositoryId == null
        ? undefined
        : {
            id: account.repositoryId,
            source: account.repositorySource!,
            externalId: account.repositoryExternalId ?? null,
            ownerId: account.repositoryOwnerId ?? null,
            owner: account.repositoryOwner!,
            repo: account.repositoryName!,
            ...(repository?.branch && {
              configuration: {
                branch: repository.branch,
                row:
                  account.configRepositoryId == null
                    ? null
                    : {
                        repositoryId: account.configRepositoryId,
                        source: account.configSource!,
                        owner: account.configOwner!,
                        repo: account.configRepo!,
                        branch: repository.branch,
                        sha: account.configSha!,
                        version: account.configVersion!,
                        object: account.configObject!,
                        lastCheckedAt: account.configCheckedAt!,
                      },
              },
            }),
          }
    if (!account.accessToken)
      return {
        id: account.id,
        accessToken: null,
        ...(repositoryIdentity && { repositoryIdentity }),
      }
    let accessToken: string
    try {
      accessToken = await decryptOAuthToken(account.accessToken, secret)
    } catch {
      throw new Error(
        'GitHub credentials could not be decrypted. Reconnect GitHub.',
      )
    }
    return {
      id: account.id,
      accessToken,
      ...(repositoryIdentity && { repositoryIdentity }),
    }
  }
}
