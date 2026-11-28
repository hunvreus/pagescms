import { first } from '#/server/db/sql'

import type { Database } from '#/server/db/client'
import type { RepositoryUser } from '#/server/repository/repositories'
import type { RequestServices } from '#/server/context'

/**
 * Services an authorized operation may use. API handlers pass the
 * request services; extensions pass the same object from their request context.
 */
export type ServiceContext = Pick<
  RequestServices,
  | 'access'
  | 'repositoryAccess'
  | 'database'
  | 'cacheDatabase'
  | 'mediaProviderResolver'
  | 'repositories'
>

/** The current account an operation runs for. Never a synthetic session. */
export interface ServiceUser extends RepositoryUser {
  name: string
  emailVerified: boolean
  image?: string | null
}

type SessionUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
  githubUsername?: string | null
}

export function serviceUserFromSession(user: SessionUser): ServiceUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image ?? null,
    githubUsername: user.githubUsername ?? null,
  }
}

export async function requireSessionServiceUser(
  services: Pick<RequestServices, 'getSession'>,
): Promise<ServiceUser> {
  const session = await services.getSession()
  if (!session?.user) throw new Error('Authentication required')
  return serviceUserFromSession(session.user)
}

/**
 * Reads the account from the application database for bearer-credential callers.
 * Returns null when the account no longer exists.
 */
export async function loadServiceUser(
  database: Database,
  userId: string,
): Promise<ServiceUser | null> {
  const user = await first<{
    id: string
    name: string
    email: string
    image: string | null
    email_verified: number
    github_username: string | null
  }>(
    database,
    'SELECT id, name, email, email_verified, image, github_username FROM user WHERE id = ?',
    [userId],
  )
  return user
    ? serviceUserFromSession({
        ...user,
        emailVerified: Boolean(user.email_verified),
        githubUsername: user.github_username,
      })
    : null
}

export function repositoryTenant(data: { owner: string; repo: string }) {
  return {
    type: 'repository' as const,
    id: `${data.owner}/${data.repo}`.toLowerCase(),
  }
}
