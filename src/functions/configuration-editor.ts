import { createServerFn } from '@tanstack/react-start'

import { repositoryRef } from '#/lib/repository'
import { resolveRepositoryPrincipal } from '#/server/repository-policy.server'

function parseCoordinates(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid configuration request')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch
  ) {
    throw new Error('Invalid configuration request')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
  }
}

function parseSaveRequest(input: unknown) {
  const coordinates = parseCoordinates(input)
  const value = input as Record<string, unknown>
  if (
    typeof value.source !== 'string' ||
    (value.sha !== null && typeof value.sha !== 'string')
  ) {
    throw new Error('Invalid configuration update')
  }
  return {
    ...coordinates,
    source: value.source,
    sha: value.sha,
  }
}

export const getConfigurationEditor = createServerFn({ method: 'GET' })
  .validator(parseCoordinates)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'configuration.read',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: { repository: data, branch: data.branch, path: '.pages.yml' },
      },
      async () => {
        const { loadConfigurationSource } =
          await import('#/server/configuration-editor.server')
        return loadConfigurationSource({
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })

export const updateConfiguration = createServerFn({ method: 'POST' })
  .validator(parseSaveRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      githubUsername: session.user.githubUsername ?? null,
    }
    return services.access.execute(
      {
        operation: 'configuration.update',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: { repository: data, branch: data.branch, path: '.pages.yml' },
      },
      async () => {
        const { saveConfigurationSource } =
          await import('#/server/configuration-editor.server')
        return saveConfigurationSource({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })
