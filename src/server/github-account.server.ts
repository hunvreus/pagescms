import { and, eq } from 'drizzle-orm'

import type { Database } from './database/client.server'

import { accountTable, userTable } from './database/schema'

interface GitHubProfile {
  avatar_url: string | null
  login: string
  name: string | null
}

export interface SyncedGitHubProfile {
  githubUsername: string
  image: string | null
  name: string
}

function isGitHubProfile(value: unknown): value is GitHubProfile {
  if (typeof value !== 'object' || value === null) return false
  const profile = value as Record<string, unknown>
  return (
    typeof profile.login === 'string' &&
    profile.login.length > 0 &&
    (typeof profile.name === 'string' || profile.name === null) &&
    (typeof profile.avatar_url === 'string' || profile.avatar_url === null)
  )
}

export async function syncGitHubProfile(
  database: Database,
  userId: string,
  fetcher: typeof fetch = fetch,
): Promise<SyncedGitHubProfile | null> {
  const [user, account] = await Promise.all([
    database.query.userTable.findFirst({
      where: eq(userTable.id, userId),
    }),
    database.query.accountTable.findFirst({
      columns: { accessToken: true },
      where: and(
        eq(accountTable.userId, userId),
        eq(accountTable.providerId, 'github'),
      ),
    }),
  ])
  if (!user || !account?.accessToken) return null

  const response = await fetcher('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${account.accessToken}`,
      'User-Agent': 'Pages-CMS',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub profile request failed (${response.status})`)
  }
  const payload: unknown = await response.json()
  if (!isGitHubProfile(payload)) {
    throw new Error('GitHub returned an invalid profile')
  }

  const profile = {
    githubUsername: payload.login,
    image: payload.avatar_url,
    name: payload.name ?? payload.login,
  }
  const patch: Partial<typeof userTable.$inferInsert> = {}
  if (user.githubUsername !== profile.githubUsername) {
    patch.githubUsername = profile.githubUsername
  }
  if ((user.image ?? null) !== profile.image) patch.image = profile.image
  if (!user.name.trim() || user.name === user.githubUsername) {
    if (user.name !== profile.name) patch.name = profile.name
  }
  if (Object.keys(patch).length > 0) {
    await database
      .update(userTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(userTable.id, userId))
  }
  return {
    ...profile,
    name: patch.name ?? user.name,
  }
}
