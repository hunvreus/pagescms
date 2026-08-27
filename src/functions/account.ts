import { createServerFn } from '@tanstack/react-start'

export function parseProfileRequest(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid profile update')
  const name = (input as Record<string, unknown>).name
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    throw new Error('Name must contain between 1 and 120 characters')
  }
  return { name: name.trim() }
}

function accountPolicy(
  userId: string,
  operation: 'account.read' | 'account.update',
) {
  return {
    operation,
    principal: { type: 'user' as const, id: userId },
    tenant: { type: 'account' as const, id: userId },
  }
}

export const getAccountSettings = createServerFn({ method: 'GET' }).handler(
  async ({ context }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      accountPolicy(session.user.id, 'account.read'),
      async () => {
        const { loadAccountSettings } =
          await import('#/server/account-service.server')
        return loadAccountSettings({
          database: services.database,
          projects: services.projects,
          user: {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            image: session.user.image ?? null,
            githubUsername: session.user.githubUsername ?? null,
          },
          githubClientId: services.configuration.auth.github?.clientId,
          githubAppName: services.configuration.githubAppName,
          isAdmin: services.configuration.adminEmails.includes(
            session.user.email.toLowerCase(),
          ),
        })
      },
    )
  },
)

export const updateProfile = createServerFn({ method: 'POST' })
  .validator(parseProfileRequest)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    if (!session?.user) throw new Error('Authentication required')
    return services.access.execute(
      accountPolicy(session.user.id, 'account.update'),
      async () => {
        const { updateAccountProfile } =
          await import('#/server/account-service.server')
        return updateAccountProfile(
          services.database,
          session.user.id,
          data.name,
        )
      },
    )
  })
