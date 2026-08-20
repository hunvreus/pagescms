import { createServerFn } from '@tanstack/react-start'

import { repositoryRef } from '#/lib/repository'

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
  return { ...repository, emails: value.emails }
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

function policy(
  data: ReturnType<typeof coordinates>,
  operation:
    'collaborator.read' | 'collaborator.invite' | 'collaborator.remove',
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

function manager(user: {
  id: string
  name: string
  email: string
  githubUsername?: string | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    githubUsername: user.githubUsername ?? null,
  }
}

export const getCollaborators = createServerFn({ method: 'GET' })
  .validator(coordinates)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      policy(data, 'collaborator.read', session.user.id),
      async () => {
        const { listCollaborators } =
          await import('#/server/collaborator-service.server')
        return listCollaborators(
          services.database,
          manager(session.user),
          data.owner,
          data.repo,
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
      policy(data, 'collaborator.invite', session.user.id),
      async () => {
        const { inviteCollaborators } =
          await import('#/server/collaborator-service.server')
        return inviteCollaborators({
          database: services.database,
          emailProvider: services.emailProvider,
          baseUrl: services.configuration.auth.baseUrl,
          user: manager(session.user),
          owner: data.owner,
          repo: data.repo,
          branch: data.branch,
          emails: data.emails,
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
      policy(data, 'collaborator.remove', session.user.id),
      async () => {
        const { removeCollaborator } =
          await import('#/server/collaborator-service.server')
        return removeCollaborator({
          database: services.database,
          user: manager(session.user),
          owner: data.owner,
          repo: data.repo,
          id: data.id,
        })
      },
    )
  })
