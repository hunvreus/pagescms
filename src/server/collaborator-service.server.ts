import { and, eq, isNull, sql } from 'drizzle-orm'

import { createGitHubApi } from './github-api.server'
import {
  createCollaboratorAddedEmail,
  createCollaboratorInviteEmail,
} from './email-templates.server'

import type { Database } from './database/client.server'
import type { EmailProvider } from './email.server'
import type { ProjectUser } from './projects.server'

import {
  accountTable,
  collaboratorInviteTable,
  collaboratorTable,
  userTable,
} from './database/schema'

type Manager = ProjectUser & { name: string }

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid email address: ${value}`)
  }
  return email
}

function inviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function requireManager(
  database: Database,
  user: Manager,
  owner: string,
  repo: string,
) {
  if (!user.githubUsername) {
    throw new Error('Only GitHub users can manage collaborators')
  }
  const account = await database.query.accountTable.findFirst({
    columns: { accessToken: true },
    where: and(
      eq(accountTable.userId, user.id),
      eq(accountTable.providerId, 'github'),
    ),
  })
  if (!account?.accessToken) {
    throw new Error('A GitHub user token is required to manage collaborators')
  }
  const api = createGitHubApi(account.accessToken)
  const repository = await api.getRepository(owner, repo)
  if (!repository.canPush) {
    throw new Error(`You do not have write access to "${owner}/${repo}"`)
  }
  const installations = await api.listInstallations()
  const installation = installations.find(
    (value) => value.account.login.toLowerCase() === owner.toLowerCase(),
  )
  if (!installation) {
    throw new Error(`"${owner}" is not part of your Pages CMS installations`)
  }
  const repositories = await api.listInstallationRepositories(installation.id)
  if (
    !repositories.some(
      (value) =>
        value.owner.toLowerCase() === owner.toLowerCase() &&
        value.name.toLowerCase() === repo.toLowerCase(),
    )
  ) {
    throw new Error(`"${owner}/${repo}" is not part of this installation`)
  }
  return {
    installation,
    repository,
    ownerType: installation.account.type === 'User' ? 'user' : 'org',
  } as const
}

function repositoryMatch(owner: string, repo: string) {
  return and(
    sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
    sql`lower(${collaboratorTable.repo}) = lower(${repo})`,
  )
}

export async function listCollaborators(
  database: Database,
  user: Manager,
  owner: string,
  repo: string,
) {
  await requireManager(database, user, owner, repo)
  return database.query.collaboratorTable.findMany({
    columns: {
      id: true,
      email: true,
      branch: true,
      userId: true,
    },
    where: repositoryMatch(owner, repo),
    orderBy: (table, { asc }) => [asc(table.email)],
  })
}

export async function inviteCollaborators(input: {
  database: Database
  emailProvider?: EmailProvider
  baseUrl: string
  user: Manager
  owner: string
  repo: string
  branch?: string
  emails: string[]
}) {
  const access = await requireManager(
    input.database,
    input.user,
    input.owner,
    input.repo,
  )
  const githubUsername = input.user.githubUsername
  if (!githubUsername) {
    throw new Error('Only GitHub users can manage collaborators')
  }
  const emails = [...new Set(input.emails.map(normalizeEmail))]
  if (!emails.length) throw new Error('At least one email address is required')
  const created = []
  for (const email of emails) {
    const verifiedUser = await input.database.query.userTable.findFirst({
      columns: { id: true },
      where: and(
        sql`lower(${userTable.email}) = lower(${email})`,
        eq(userTable.emailVerified, true),
      ),
    })
    const existing = await input.database.query.collaboratorTable.findFirst({
      where: and(
        repositoryMatch(input.owner, input.repo),
        sql`lower(${collaboratorTable.email}) = lower(${email})`,
      ),
    })
    if (existing) throw new Error(`${email} is already a collaborator`)
    if (!verifiedUser && !input.emailProvider) {
      throw new Error('An email provider is required to invite new users')
    }
    const rows = await input.database
      .insert(collaboratorTable)
      .values({
        type: access.ownerType,
        installationId: access.installation.id,
        ownerId: access.repository.ownerId,
        repoId: access.repository.id,
        owner: access.repository.owner,
        repo: access.repository.repo,
        branch: input.branch ?? null,
        email,
        userId: verifiedUser?.id ?? null,
        invitedBy: input.user.id,
      })
      .returning()
    const collaborator = rows[0]
    const repoName = `${input.owner}/${input.repo}`
    const invitedByName = input.user.name || input.user.email
    const invitedByUrl = `https://github.com/${encodeURIComponent(githubUsername)}`

    if (!verifiedUser) {
      const token = inviteToken()
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      await input.database
        .delete(collaboratorInviteTable)
        .where(
          and(
            sql`lower(${collaboratorInviteTable.email}) = lower(${email})`,
            sql`lower(${collaboratorInviteTable.owner}) = lower(${input.owner})`,
            sql`lower(${collaboratorInviteTable.repo}) = lower(${input.repo})`,
          ),
        )
      await input.database.insert(collaboratorInviteTable).values({
        token,
        email,
        owner: input.owner,
        repo: input.repo,
        expiresAt,
      })
      const inviteUrl = new URL(`/invite/${token}`, input.baseUrl).toString()
      try {
        await input.emailProvider!.send(
          createCollaboratorInviteEmail({
            baseUrl: input.baseUrl,
            email,
            repoName,
            inviteUrl,
            invitedByName,
            invitedByUrl,
          }),
        )
      } catch (error) {
        await Promise.all([
          input.database
            .delete(collaboratorInviteTable)
            .where(eq(collaboratorInviteTable.token, token)),
          input.database
            .delete(collaboratorTable)
            .where(eq(collaboratorTable.id, collaborator.id)),
        ])
        throw error
      }
    } else if (input.emailProvider) {
      const repositoryPath = input.branch
        ? `/${input.owner}/${input.repo}/${encodeURIComponent(input.branch)}`
        : `/${input.owner}/${input.repo}`
      try {
        await input.emailProvider.send(
          createCollaboratorAddedEmail({
            baseUrl: input.baseUrl,
            email,
            repoName,
            repoUrl: new URL(repositoryPath, input.baseUrl).toString(),
            invitedByName,
            invitedByUrl,
          }),
        )
      } catch (error) {
        console.error(`Failed to notify collaborator ${email}`, error)
      }
    }
    created.push({
      id: collaborator.id,
      email: collaborator.email,
      branch: collaborator.branch,
      userId: collaborator.userId,
    })
  }
  return created
}

export async function removeCollaborator(input: {
  database: Database
  user: Manager
  owner: string
  repo: string
  id: number
}) {
  await requireManager(input.database, input.user, input.owner, input.repo)
  const collaborator = await input.database.query.collaboratorTable.findFirst({
    where: and(
      eq(collaboratorTable.id, input.id),
      repositoryMatch(input.owner, input.repo),
    ),
  })
  if (!collaborator) throw new Error('Collaborator not found')
  await Promise.all([
    input.database
      .delete(collaboratorTable)
      .where(eq(collaboratorTable.id, collaborator.id)),
    input.database
      .delete(collaboratorInviteTable)
      .where(
        and(
          sql`lower(${collaboratorInviteTable.email}) = lower(${collaborator.email})`,
          sql`lower(${collaboratorInviteTable.owner}) = lower(${input.owner})`,
          sql`lower(${collaboratorInviteTable.repo}) = lower(${input.repo})`,
        ),
      ),
  ])
  return { id: collaborator.id }
}

export async function bindVerifiedCollaborator(
  database: Database,
  user: { id: string; email: string; emailVerified: boolean },
) {
  if (!user.emailVerified) return
  await database
    .update(collaboratorTable)
    .set({ userId: user.id })
    .where(
      and(
        isNull(collaboratorTable.userId),
        sql`lower(${collaboratorTable.email}) = lower(${normalizeEmail(user.email)})`,
      ),
    )
}

export async function collaboratorInviteStatus(
  database: Database,
  token: string,
  user?: { id: string; email: string; emailVerified: boolean },
) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token))
    return { status: 'unavailable' as const }
  const invite = await database.query.collaboratorInviteTable.findFirst({
    where: eq(collaboratorInviteTable.token, token),
  })
  if (!invite) return { status: 'unavailable' as const }
  if (invite.expiresAt.getTime() <= Date.now()) {
    await database
      .delete(collaboratorInviteTable)
      .where(eq(collaboratorInviteTable.id, invite.id))
    return { status: 'unavailable' as const }
  }
  const collaborator = await database.query.collaboratorTable.findFirst({
    where: and(
      repositoryMatch(invite.owner, invite.repo),
      sql`lower(${collaboratorTable.email}) = lower(${invite.email})`,
    ),
  })
  if (!collaborator) return { status: 'unavailable' as const }
  const destination = collaborator.branch
    ? `/${invite.owner}/${invite.repo}/${encodeURIComponent(collaborator.branch)}`
    : `/${invite.owner}/${invite.repo}`
  if (!user) {
    const [local = '', domain = ''] = invite.email.split('@')
    const visible = local.slice(0, 2)
    return {
      status: 'sign-in' as const,
      email: invite.email,
      maskedEmail: `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`,
      destination,
    }
  }
  if (
    !user.emailVerified ||
    normalizeEmail(user.email) !== normalizeEmail(invite.email)
  ) {
    return { status: 'wrong-account' as const }
  }
  await Promise.all([
    database
      .update(collaboratorTable)
      .set({ userId: user.id })
      .where(eq(collaboratorTable.id, collaborator.id)),
    database
      .delete(collaboratorInviteTable)
      .where(eq(collaboratorInviteTable.id, invite.id)),
  ])
  return { status: 'ready' as const, destination }
}
