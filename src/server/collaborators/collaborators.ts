import { recordActivity } from '#/server/activity/store'
import { preferredLocale } from '#/i18n/locale'
import type { Locale } from '#/i18n/locale'
import type { RepositoryAccessService } from '#/server/access/repository'
import { observeRepositoryIdentity } from '#/server/access/repository-identity'

import {
  createCollaboratorAddedEmail,
  createCollaboratorInviteEmail,
} from '../email/templates'
import { logServerEvent, serverErrorDetails } from '../http'
import { executeAtomic } from '#/server/db/core'
import { all, first } from '#/server/db/sql'
import { createGitHubAppApi } from '#/server/github/app'
import { DEFAULT_REPOSITORY_SOURCE } from '../repository/provider'

import type { Database, DatabaseStatement } from '#/server/db/client'
import type { collaboratorTable, userTable } from '#/server/db/schema'
import type { EmailProvider } from '../email/email'
import type { RepositoryUser } from '../repository/repositories'

export class CollaboratorRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503 = 400,
  ) {
    super(message)
    this.name = 'CollaboratorRequestError'
  }
}

type Manager = RepositoryUser & { name?: string | null; image?: string | null }
export type InstallationLookup = (
  owner: string,
  repo: string,
) => Promise<{
  id: number
  account: { login: string; type: 'User' | 'Organization' }
}>
export type CreatedMembership = Readonly<{
  id: number
  email: string
  userId: string | null
}>

export function repositoryInstallationLookup(
  githubApp: Parameters<typeof createGitHubAppApi>[0] | undefined,
): InstallationLookup | undefined {
  return githubApp
    ? createGitHubAppApi(githubApp).getRepositoryInstallation
    : undefined
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CollaboratorRequestError(`Invalid email address: ${value}`)
  }
  return email
}

async function requireManager(
  database: Database,
  user: Manager,
  owner: string,
  repo: string,
  repositoryAccess: Pick<RepositoryAccessService, 'resolve'>,
  installationLookup?: InstallationLookup,
  repoId?: string,
) {
  if (!user.githubUsername) {
    throw new CollaboratorRequestError(
      'Only GitHub users can manage collaborators',
      403,
    )
  }
  const {
    api,
    tokenSource,
    repository: admittedRepository,
  } = await repositoryAccess.resolve(user, owner, repo, undefined, repoId)
  if (tokenSource !== 'user') {
    throw new CollaboratorRequestError(
      'A GitHub user token is required to manage collaborators',
      403,
    )
  }
  const repository =
    admittedRepository ?? (await api.getRepository(owner, repo))
  if (!admittedRepository)
    await observeRepositoryIdentity(database, repository, { owner, repo })
  if (!repository.canPush) {
    throw new CollaboratorRequestError(
      `You do not have write access to "${owner}/${repo}"`,
    )
  }
  if (!installationLookup)
    throw new CollaboratorRequestError(
      'GitHub App credentials are required to manage collaborators',
      503,
    )
  const installation = await installationLookup(owner, repo)
  if (installation.account.login.toLowerCase() !== owner.toLowerCase())
    throw new CollaboratorRequestError(
      'Repository installation owner does not match',
    )
  return {
    installation,
    repository,
    ownerType: installation.account.type === 'User' ? 'user' : 'org',
  } as const
}

async function managerProfile(database: Database, user: Manager) {
  if (user.name !== undefined)
    return { name: user.name || null, image: user.image ?? null }
  const profile = await first<
    Pick<typeof userTable.$inferSelect, 'name' | 'image'>
  >(database, 'SELECT name, image FROM user WHERE id = ?', [user.id])
  return { name: profile?.name || null, image: profile?.image ?? null }
}

export async function listCollaborators(
  database: Database,
  user: Manager,
  owner: string,
  repo: string,
  repositoryAccess: Pick<RepositoryAccessService, 'resolve'>,
  installationLookup?: InstallationLookup,
  repoId?: string,
) {
  const { repository } = await requireManager(
    database,
    user,
    owner,
    repo,
    repositoryAccess,
    installationLookup,
    repoId,
  )
  return all<{
    id: number
    email: string
    name: string | null
    userId: string | null
    image: string | null
    inviteExpiresAt: null
  }>(
    database,
    `SELECT c.id, c.email, coalesce(nullif(trim(u.name), ''), c.name) AS name,
      c.user_id AS userId, u.image, null AS inviteExpiresAt
    FROM collaborator c LEFT JOIN user u ON c.user_id = u.id
    WHERE c.repo_id = ? ORDER BY c.email`,
    [repository.id],
  )
}

/**
 * Unrevoked memberships for the current repository and owner, including
 * pending invitations whose private grants may already exist. Callers must
 * authorize the repository manager first.
 */
export async function listActiveMemberships(
  database: Database,
  owner: string,
  repo: string,
  repoId?: string,
): Promise<CreatedMembership[]> {
  return all<CreatedMembership>(
    database,
    `SELECT c.id, c.email, c.user_id AS userId FROM collaborator c
    JOIN repository r ON c.repo_id = r.external_id AND c.owner_id = r.owner_id
    JOIN repository_address a ON a.repository_id = r.id
    WHERE a.source = ? AND a.owner = ? AND a.repo = ?
      AND (? IS NULL OR (r.source = a.source AND r.external_id = ?))
    ORDER BY c.id`,
    [
      DEFAULT_REPOSITORY_SOURCE,
      owner.toLowerCase(),
      repo.toLowerCase(),
      repoId ?? null,
      repoId ?? null,
    ],
  )
}

export async function inviteCollaborators(input: {
  database: Database
  emailProvider?: EmailProvider
  baseUrl: string
  defaultLanguage?: Locale
  user: Manager
  owner: string
  repo: string
  repoId?: string
  emails: string[]
  names?: Record<string, string>
  waitUntil?: (promise: Promise<unknown>) => void
  /**
   * Runs after the membership row commits and before any notification. A
   * failure deletes the membership and sends nothing.
   * Membership stays pending and cannot authorize access until this completes,
   * including when private grants are stored in a separate database.
   */
  afterCreate?: (membership: CreatedMembership) => Promise<void>
  afterCreateFailure?: (membership: CreatedMembership) => Promise<void>
  repositoryAccess: Pick<RepositoryAccessService, 'resolve'>
  installationLookup?: InstallationLookup
}) {
  const access = await requireManager(
    input.database,
    input.user,
    input.owner,
    input.repo,
    input.repositoryAccess,
    input.installationLookup,
    input.repoId,
  )
  const githubUsername = input.user.githubUsername
  if (!githubUsername) {
    throw new CollaboratorRequestError(
      'Only GitHub users can manage collaborators',
      403,
    )
  }
  const emails = [...new Set(input.emails.map(normalizeEmail))]
  if (!emails.length)
    throw new CollaboratorRequestError('At least one email address is required')
  const existingCollaborator = (email: string) =>
    first<Pick<typeof collaboratorTable.$inferSelect, 'id'>>(
      input.database,
      'SELECT id FROM collaborator WHERE repo_id = ? AND lower(email) = lower(?) LIMIT 1',
      [access.repository.id, email],
    )
  // Validate the batch before creating memberships or sending any invitation.
  for (const email of emails) {
    const existing = await existingCollaborator(email)
    if (existing)
      throw new CollaboratorRequestError(
        `${email} is already a collaborator`,
        409,
      )
    if (!input.emailProvider) {
      const user = await first<Pick<typeof userTable.$inferSelect, 'id'>>(
        input.database,
        'SELECT id FROM user WHERE lower(email) = lower(?) AND email_verified = 1 LIMIT 1',
        [email],
      )
      if (!user)
        throw new CollaboratorRequestError(
          'An email provider is required to invite new users',
          503,
        )
    }
  }
  const actor = await managerProfile(input.database, input.user)
  const fallback = input.defaultLanguage ?? 'en'
  const created = []
  for (const email of emails) {
    const verifiedUser = await first<{
      id: string
      name: string
      image: string | null
      language: string | null
    }>(
      input.database,
      `SELECT id, name, image, json_extract(preferences, '$.language') AS language FROM user
        WHERE lower(email) = lower(?) AND email_verified = 1 LIMIT 1`,
      [email],
    )
    const existing = await existingCollaborator(email)
    if (existing)
      throw new CollaboratorRequestError(
        `${email} is already a collaborator`,
        409,
      )
    if (!verifiedUser && !input.emailProvider) {
      throw new CollaboratorRequestError(
        'An email provider is required to invite new users',
        503,
      )
    }
    const results = await executeAtomic(input.database, [
      {
        sql: `INSERT INTO collaborator (type, installation_id, owner_id, repo_id, owner, repo,
          email, name, user_id, invited_by, pending, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [
          access.ownerType,
          access.installation.id,
          access.repository.ownerId,
          access.repository.id,
          access.repository.owner,
          access.repository.repo,
          email,
          input.names?.[email]?.trim() || null,
          verifiedUser?.id ?? null,
          input.user.id,
          input.afterCreate ? 1 : 0,
          Date.now(),
        ],
      },
    ])
    const collaborator = {
      id: Number((results[0].rows[0] as { id: number }).id),
      email,
      userId: verifiedUser?.id ?? null,
    }
    async function revokeFailedInvitation() {
      try {
        await executeAtomic(input.database, [
          {
            sql: 'DELETE FROM collaborator WHERE id = ?',
            args: [collaborator.id],
          },
        ])
      } catch (error) {
        logServerEvent('error', {
          event: 'collaborator_invitation_rollback_failed',
          membershipId: collaborator.id,
          ...serverErrorDetails(error),
        })
        // An active hosted grant can have full access without its assignment.
        return
      }
      try {
        await input.afterCreateFailure?.(collaborator)
      } catch (error) {
        logServerEvent('error', {
          event: 'permission_assignment_cleanup_failed',
          membershipId: collaborator.id,
          ...serverErrorDetails(error),
        })
      }
    }
    if (input.afterCreate) {
      try {
        await input.afterCreate(collaborator)
        const activated = await executeAtomic(input.database, [
          {
            sql: 'UPDATE collaborator SET pending = 0 WHERE id = ?',
            args: [collaborator.id],
          },
        ])
        if (activated[0].rowsAffected !== 1)
          throw new CollaboratorRequestError('The invitation was revoked')
      } catch (error) {
        await revokeFailedInvitation()
        throw error
      }
    }
    const repoName = `${input.owner}/${input.repo}`
    const invitedByName = actor.name || input.user.email
    const invitedByUrl = `https://github.com/${encodeURIComponent(githubUsername)}`

    if (!verifiedUser) {
      const repositoryPath = `/github/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`
      const inviteUrl = new URL(repositoryPath, input.baseUrl).toString()
      try {
        await input.emailProvider!.send(
          createCollaboratorInviteEmail({
            baseUrl: input.baseUrl,
            email,
            repoName,
            inviteUrl,
            invitedByName,
            invitedByUrl,
            locale: fallback,
          }),
        )
      } catch (error) {
        await revokeFailedInvitation()
        throw error
      }
    } else if (input.emailProvider) {
      const repositoryPath = `/github/${input.owner}/${input.repo}`
      try {
        await input.emailProvider.send(
          createCollaboratorAddedEmail({
            baseUrl: input.baseUrl,
            email,
            repoName,
            repoUrl: new URL(repositoryPath, input.baseUrl).toString(),
            invitedByName,
            invitedByUrl,
            locale:
              // Tolerate externally modified preference values.
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              preferredLocale(verifiedUser?.language, undefined) ?? fallback,
          }),
        )
      } catch (error) {
        logServerEvent('error', {
          event: 'collaborator_notification_failed',
          owner: input.owner,
          repo: input.repo,
          ...serverErrorDetails(error),
        })
      }
    }
    const activity = recordActivity(input.database, [
      {
        owner: input.owner,
        repo: input.repo,
        branch: '',
        origin: 'cms',
        kind: collaborator.userId ? 'added' : 'invited',
        area: 'collaborator',
        resource: '',
        path: input.names?.[email]?.trim() || email,
        actor: actor.name || null,
        actorImage: actor.image,
        actorId: input.user.id,
        occurredAt: new Date(),
        key: `collaborator:${collaborator.id}:added`,
      },
    ]).catch((error: unknown) => {
      logServerEvent('error', {
        event: 'activity_capture_failed',
        operation: 'collaborator.invite',
        ...serverErrorDetails(error),
      })
    })
    if (input.waitUntil) input.waitUntil(activity)
    else await activity
    created.push({
      id: collaborator.id,
      email: collaborator.email,
      name: verifiedUser?.name || input.names?.[email]?.trim() || null,
      image: verifiedUser?.image ?? null,
      userId: collaborator.userId,
      inviteExpiresAt: null,
    })
  }
  return created
}

export async function revokeCollaborators(
  database: Database,
  match: DatabaseStatement,
  actor?: string,
  actorImage?: string | null,
  actorId?: string | null,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  const removedAt = new Date()
  // Delete invitations while the selected membership is still active, in the
  // same transaction as revocation. An old removal cannot revoke a reinvite.
  const results = await executeAtomic(database, [
    {
      sql: `DELETE FROM collaborator_invite WHERE EXISTS (
        SELECT 1 FROM collaborator WHERE ${match.sql}
        AND collaborator.repo_id = collaborator_invite.repo_id
        AND lower(collaborator.email) = lower(collaborator_invite.email)
      )`,
      args: match.args,
    },
    {
      sql: `DELETE FROM collaborator WHERE ${match.sql} RETURNING id, owner, repo, email, name`,
      args: match.args,
    },
  ])
  const removedCount = results[1].rows.length
  if (removedCount) {
    const removed = results[1].rows as {
      id: number
      owner: string
      repo: string
      email: string
      name: string | null
    }[]
    const activity = recordActivity(
      database,
      removed.map((row) => ({
        owner: row.owner,
        repo: row.repo,
        branch: '',
        origin: 'cms',
        kind: 'removed',
        area: 'collaborator',
        resource: '',
        path: row.name || row.email,
        actor: actor ?? null,
        actorImage: actorImage ?? null,
        actorId: actorId ?? null,
        occurredAt: removedAt,
        key: `collaborator:${row.id}:removed`,
      })),
    ).catch((error: unknown) => {
      logServerEvent('error', {
        event: 'activity_capture_failed',
        operation: 'collaborator.remove',
        ...serverErrorDetails(error),
      })
    })
    if (waitUntil) waitUntil(activity)
    else await activity
  }
  return removedCount
}

export async function removeCollaborator(input: {
  database: Database
  user: Manager
  owner: string
  repo: string
  repoId?: string
  id: number
  waitUntil?: (promise: Promise<unknown>) => void
  repositoryAccess: Pick<RepositoryAccessService, 'resolve'>
  installationLookup?: InstallationLookup
}) {
  const { repository } = await requireManager(
    input.database,
    input.user,
    input.owner,
    input.repo,
    input.repositoryAccess,
    input.installationLookup,
    input.repoId,
  )
  const collaborator = await first<{
    id: number
    email: string
    userId: string | null
  }>(
    input.database,
    'SELECT id, email, user_id AS userId FROM collaborator WHERE id = ? AND repo_id = ? LIMIT 1',
    [input.id, repository.id],
  )
  if (!collaborator)
    throw new CollaboratorRequestError('Collaborator not found', 404)
  const actor = await managerProfile(input.database, input.user)
  const removed = await revokeCollaborators(
    input.database,
    {
      sql: 'collaborator.id = ? AND collaborator.repo_id = ?',
      args: [collaborator.id, repository.id],
    },
    actor.name ?? undefined,
    actor.image,
    input.user.id,
    input.waitUntil,
  )
  if (removed !== 1)
    throw new CollaboratorRequestError('Collaborator not found', 404)
  return {
    id: collaborator.id,
    email: collaborator.email,
    userId: collaborator.userId,
  }
}
