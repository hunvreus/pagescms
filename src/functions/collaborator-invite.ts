import { createServerFn } from '@tanstack/react-start'

function inviteToken(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(value)) {
    throw new Error('Invalid invitation token')
  }
  return value
}

export const getCollaboratorInvite = createServerFn({ method: 'GET' })
  .validator(inviteToken)
  .handler(async ({ context, data }) => {
    const services = context.getServices()
    const session = await services.getSession()
    const { collaboratorInviteStatus } =
      await import('#/server/collaborator-service.server')
    return collaboratorInviteStatus(
      services.database,
      data,
      session?.user
        ? {
            id: session.user.id,
            email: session.user.email,
            emailVerified: session.user.emailVerified,
          }
        : undefined,
    )
  })
