import { createServerFn } from '@tanstack/react-start'

import { repositoryRef } from '#/lib/repository'

export function parseReferenceRequest(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid reference request')
  const value = input as Record<string, unknown>
  if (
    typeof value.owner !== 'string' ||
    typeof value.repo !== 'string' ||
    typeof value.branch !== 'string' ||
    !value.branch ||
    typeof value.collection !== 'string' ||
    !value.collection ||
    typeof value.query !== 'string' ||
    typeof value.valueTemplate !== 'string' ||
    typeof value.labelTemplate !== 'string' ||
    !Array.isArray(value.searchFields) ||
    !value.searchFields.every((field) => typeof field === 'string') ||
    !Array.isArray(value.selectedValues) ||
    !value.selectedValues.every((selected) => typeof selected === 'string')
  ) {
    throw new Error('Invalid reference request')
  }
  if (
    value.query.length > 100 ||
    value.valueTemplate.length > 200 ||
    value.labelTemplate.length > 200 ||
    value.searchFields.length > 10 ||
    value.selectedValues.length > 100
  ) {
    throw new Error('Reference request is too large')
  }
  return {
    ...repositoryRef({ owner: value.owner, repo: value.repo }),
    branch: value.branch,
    collection: value.collection,
    query: value.query,
    valueTemplate: value.valueTemplate,
    labelTemplate: value.labelTemplate,
    searchFields: value.searchFields,
    selectedValues: value.selectedValues,
  }
}

export const getReferenceOptions = createServerFn({ method: 'GET' })
  .validator(parseReferenceRequest)
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
        operation: 'reference.read',
        principal: { type: 'user', id: user.id },
        tenant: {
          type: 'repository',
          id: `${data.owner}/${data.repo}`.toLowerCase(),
        },
        target: {
          repository: data,
          branch: data.branch,
          collection: data.collection,
        },
      },
      async () => {
        const { loadReferenceOptions } =
          await import('#/server/reference-service.server')
        return loadReferenceOptions({
          database: services.database,
          repositoryAccess: services.repositoryAccess,
          user,
          ...data,
        })
      },
    )
  })
