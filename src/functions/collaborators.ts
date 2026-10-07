import { logServerEvent, serverErrorDetails } from '#/server/http'
import { collaboratorKey } from '#/lib/collaborator-key'
import { createServerFn } from '@tanstack/react-start'

import { validateRepositoryPermissions } from '#/deployment/contracts/hosted.server'
import { repositoryRef } from '#/lib/repository'
import {
  resolveRepositoryPrincipal,
  requireRepositoryManager,
} from '#/server/repository-policy.server'
import { createGitHubAppApi } from '#/server/github-app.server'

import type { ProjectUser } from '#/server/projects.server'
import type { RequestServices } from '#/server/request-services.server'

function coordinates(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid collaborator request')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch
  ) {
    throw new Error('Invalid collaborator request')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
  }
}

function inviteRequest(input: unknown) {
  const repository = coordinates(input)
  const value = input as Record<string, unknown>
  if (
    !Array.isArray(value.emails) ||
    !value.emails.every((email) => typeof email === 'string')
  ) {
    throw new Error('Invalid collaborator emails')
  }
  const permissions =
    value.permissions === undefined
      ? undefined
      : validateRepositoryPermissions({
          version: (value.permissions as Record<string, unknown> | null)
            ?.expectedVersion,
          roles: [],
          assignments: [
            {
              principalId: 'invitation',
              roles: (value.permissions as Record<string, unknown> | null)
                ?.roles,
              branches: (value.permissions as Record<string, unknown> | null)
                ?.branches,
            },
          ],
        })
  return { ...repository, emails: value.emails, permissions }
}

function removeRequest(input: unknown) {
  const repository = coordinates(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.id !== 'number' ||
    !Number.isInteger(value.id) ||
    value.id <= 0
  ) {
    throw new Error('Invalid collaborator id')
  }
  return { ...repository, id: value.id }
}

async function policy(
  data: ReturnType<typeof coordinates>,
  operation:
    'collaborator.read' | 'collaborator.invite' | 'collaborator.remove',
  services: RequestServices,
  user: ProjectUser,
) {
  return {
    operation,
    principal: await resolveRepositoryPrincipal(
      services.repositoryAccess,
      user,
      data,
    ),
    tenant: {
      type: 'repository' as const,
      id: `${data.owner}/${data.repo}`.toLowerCase(),
    },
    target: {
      repository: data,
      branch: data.branch,
    },
  }
}

function manager(user: {
  id: string
  name: string
  email: string
  emailVerified: boolean
  githubUsername?: string | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    githubUsername: user.githubUsername ?? null,
  }
}

function installationLookup(services: RequestServices) {
  const configuration = services.configuration.githubApp
  return configuration
    ? createGitHubAppApi(configuration).getRepositoryInstallation
    : undefined
}

export const getCollaborators = createServerFn({ method: 'GET' })
  .validator(coordinates)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      await policy(data, 'collaborator.read', services, manager(session.user)),
      async () => {
        const { listCollaborators } =
          await import('#/server/collaborator-service.server')
        return listCollaborators(
          services.database,
          manager(session.user),
          data.owner,
          data.repo,
          services.githubApiFactory,
          installationLookup(services),
        )
      },
    )
  })

export const addCollaborators = createServerFn({ method: 'POST' })
  .validator(inviteRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      await policy(
        data,
        'collaborator.invite',
        services,
        manager(session.user),
      ),
      async () => {
        if (services.repositoryPermissionAdmin && !data.permissions)
          throw new Error('Select collaborator permissions before inviting')
        const { inviteCollaborators } =
          await import('#/server/collaborator-service.server')
        return inviteCollaborators({
          database: services.database,
          emailProvider: services.emailProvider,
          baseUrl: services.configuration.auth.baseUrl,
          user: manager(session.user),
          owner: data.owner,
          repo: data.repo,
          emails: data.emails,
          githubApiFactory: services.githubApiFactory,
          installationLookup: installationLookup(services),
          prepare: data.permissions
            ? async (emails) => {
                const admin = services.repositoryPermissionAdmin
                if (!admin)
                  throw new Error('Repository permissions are not configured')
                const user = manager(session.user)
                await requireRepositoryManager(
                  services.repositoryAccess,
                  user,
                  data,
                )
                const selection = data.permissions!
                await services.access.execute(
                  {
                    ...(await policy(
                      data,
                      'collaborator.invite',
                      services,
                      user,
                    )),
                    operation: 'repository.permissions.update',
                  },
                  async () => {
                    const current = await admin.read(data)
                    if (current.version !== selection.version)
                      throw new Error(
                        'Permissions changed; reload before inviting',
                      )
                    const selected = selection.assignments[0]
                    if (
                      selected.roles.some(
                        (id) =>
                          id !== 'full-access' &&
                          !current.roles.some((role) => role.id === id),
                      )
                    )
                      throw new Error('Selected role no longer exists')
                    const keys = emails.map(collaboratorKey)
                    await admin.replace({
                      ...data,
                      actorId: user.id,
                      expectedVersion: selection.version,
                      roles: current.roles,
                      assignments: [
                        ...current.assignments.filter(
                          (assignment) =>
                            !keys.includes(assignment.principalId),
                        ),
                        ...keys.map((principalId) => ({
                          ...selected,
                          principalId,
                        })),
                      ],
                    })
                  },
                )
              }
            : undefined,
        })
      },
    )
  })

export const deleteCollaborator = createServerFn({ method: 'POST' })
  .validator(removeRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      await policy(
        data,
        'collaborator.remove',
        services,
        manager(session.user),
      ),
      async () => {
        const { removeCollaborator } =
          await import('#/server/collaborator-service.server')
        const removed = await removeCollaborator({
          database: services.database,
          user: manager(session.user),
          owner: data.owner,
          repo: data.repo,
          id: data.id,
          githubApiFactory: services.githubApiFactory,
          installationLookup: installationLookup(services),
        })
        const admin = services.repositoryPermissionAdmin
        if (admin) {
          try {
            const current = await admin.read(data)
            const keys = [collaboratorKey(removed.email), removed.userId]
            const assignments = current.assignments.filter(
              (assignment) => !keys.includes(assignment.principalId),
            )
            if (assignments.length !== current.assignments.length)
              await admin.replace({
                ...data,
                actorId: session.user.id,
                expectedVersion: current.version,
                roles: current.roles,
                assignments,
              })
          } catch (error) {
            // Core membership is already revoked; cleanup cannot restore access.
            logServerEvent('error', {
              event: 'collaborator_permissions_cleanup_failed',
              owner: data.owner,
              repo: data.repo,
              ...serverErrorDetails(error),
            })
          }
        }
        return { id: removed.id }
      },
    )
  })
