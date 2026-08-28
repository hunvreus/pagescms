import { createServerFn } from '@tanstack/react-start'

import { validateRepositoryPermissionSnapshot } from '#/deployment/contracts/hosted.server'
import { repositoryRef } from '#/lib/repository'

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
  const validated = validateRepositoryPermissionSnapshot({
    version: value.expectedVersion,
    grants: value.grants,
  })
  return {
    ...repository,
    expectedVersion: value.expectedVersion,
    grants: validated.grants,
  }
}

function policy(
  data: ReturnType<typeof coordinates>,
  operation: 'repository.permissions.read' | 'repository.permissions.update',
  userId: string,
) {
  return {
    operation,
    principal: { type: 'user' as const, id: userId },
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
      githubUsername: session.user.githubUsername ?? null,
    }
    await services.repositoryAccess.resolve(
      user,
      data.owner,
      data.repo,
      data.branch,
    )
    return services.access.execute(
      policy(data, 'repository.permissions.read', user.id),
      async () =>
        validateRepositoryPermissionSnapshot(
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
      githubUsername: session.user.githubUsername ?? null,
    }
    await services.repositoryAccess.resolve(
      user,
      data.owner,
      data.repo,
      data.branch,
    )
    return services.access.execute(
      policy(data, 'repository.permissions.update', user.id),
      async () =>
        validateRepositoryPermissionSnapshot(
          await admin.replace({
            owner: data.owner,
            repo: data.repo,
            expectedVersion: data.expectedVersion,
            grants: data.grants,
            actorId: user.id,
          }),
        ),
    )
  })
