import { createServerFn } from '@tanstack/react-start'

import { repositoryRef } from '#/lib/repository'

function parseCollectionRequest(input: unknown) {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid collection request')
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
    throw new Error('Invalid collection request')
  }
  const repository = repositoryRef({ owner: value.owner, repo: value.repo })
  return {
    ...repository,
    branch: value.branch,
    name: value.name,
    path: typeof value.path === 'string' && value.path ? value.path : undefined,
  }
}

export const getCollection = createServerFn({ method: 'GET' })
  .validator(parseCollectionRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    const user = {
      id: session.user.id,
      email: session.user.email,
      githubUsername: session.user.githubUsername ?? null,
    }

    return services.access.execute(
      {
        operation: 'collection.read',
        principal: { type: 'user', id: user.id },
        tenant: {
          type: 'repository',
          id: `${data.owner.toLowerCase()}/${data.repo.toLowerCase()}`,
        },
        target: {
          repository: { owner: data.owner, repo: data.repo },
          branch: data.branch,
          collection: data.name,
          ...(data.path ? { path: data.path } : {}),
        },
      },
      async () => {
        const { loadCollection } =
          await import('#/server/collection-service.server')
        return loadCollection({
          database: services.database,
          background: services.background,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })
