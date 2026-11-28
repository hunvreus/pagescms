import { first } from '#/server/db/sql'

import type { Database } from '#/server/db/client'
import type { userTable } from '#/server/db/schema'

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
  accessToken: string | null,
  fetcher: typeof fetch = fetch,
): Promise<SyncedGitHubProfile | null> {
  if (!accessToken) return null

  const response = await fetcher('https://api.github.com/user', {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
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
  // Check confirmation at write time: the user may finish setup while GitHub responds.
  const saved = await first<
    Pick<typeof userTable.$inferSelect, 'image' | 'name'>
  >(
    database,
    `
    UPDATE user SET github_username = ?,
      image = CASE WHEN onboarding_completed_at IS NULL THEN ? ELSE image END,
      name = CASE WHEN onboarding_completed_at IS NULL AND (trim(name) = '' OR name = github_username) THEN ? ELSE name END,
      updated_at = ?
    WHERE id = ? RETURNING image, name`,
    [profile.githubUsername, profile.image, profile.name, Date.now(), userId],
  )
  return saved ? { ...profile, ...saved } : null
}
