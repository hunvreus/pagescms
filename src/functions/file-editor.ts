import { createServerFn } from '@tanstack/react-start'

import { repositoryRef } from '#/lib/repository'
import { resolveRepositoryPrincipal } from '#/server/repository-policy.server'

function parseFileRequest(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid file request')
  }
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name.includes('/')
  ) {
    throw new Error('Invalid file request')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
    name: value.name,
  }
}

export const getFixedFile = createServerFn({ method: 'GET' })
  .validator(parseFileRequest)
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
        operation: 'entry.read',
        principal: await resolveRepositoryPrincipal(
          services.repositoryAccess,
          user,
          data,
        ),
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.name,
        },
      },
      async () => {
        const { loadFixedFile } = await import('#/server/entry-editor.server')
        return loadFixedFile({
          database: services.cacheDatabase,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })
