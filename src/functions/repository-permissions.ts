import { createServerFn } from '@tanstack/react-start'

import { validateRepositoryPermissions } from '#/deployment/contracts/hosted.server'
import { repositoryRef } from '#/lib/repository'
import {
  resolveRepositoryPrincipal,
  requireRepositoryManager,
} from '#/server/repository-policy.server'

import type { ProjectUser } from '#/server/projects.server'
import type { RequestServices } from '#/server/request-services.server'

function coordinates(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid repository permission request')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch
  ) {
    throw new Error('Invalid repository permission request')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
  }
}

function replacement(input: unknown) {
  const repository = coordinates(input)
  const value = input as Record<string, unknown>
  if (typeof value.expectedVersion !== 'string' || !value.expectedVersion) {
    throw new Error('A permission snapshot version is required')
  }
  const validated = validateRepositoryPermissions({
    version: value.expectedVersion,
    roles: value.roles,
    assignments: value.assignments,
  })
  return {
    ...repository,
    expectedVersion: value.expectedVersion,
    roles: validated.roles,
    assignments: validated.assignments,
  }
}

async function policy(
  data: ReturnType<typeof coordinates>,
  operation: 'repository.permissions.read' | 'repository.permissions.update',
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

export const getRepositoryPermissions = createServerFn({ method: 'GET' })
  .validator(coordinates)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const admin = services.repositoryPermissionAdmin
    if (!admin) throw new Error('Repository permissions are not configured')
    const user = {
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    await requireRepositoryManager(services.repositoryAccess, user, data)
    return services.access.execute(
      await policy(data, 'repository.permissions.read', services, user),
      async () =>
        validateRepositoryPermissions(
          await admin.read({ owner: data.owner, repo: data.repo }),
        ),
    )
  })

export const replaceRepositoryPermissions = createServerFn({ method: 'POST' })
  .validator(replacement)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const admin = services.repositoryPermissionAdmin
    if (!admin) throw new Error('Repository permissions are not configured')
    const user = {
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    await requireRepositoryManager(services.repositoryAccess, user, data)
    return services.access.execute(
      await policy(data, 'repository.permissions.update', services, user),
      async () =>
        validateRepositoryPermissions(
          await admin.replace({
            owner: data.owner,
            repo: data.repo,
            expectedVersion: data.expectedVersion,
            roles: data.roles,
            assignments: data.assignments,
            actorId: user.id,
          }),
        ),
    )
  })
