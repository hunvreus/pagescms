import { createServerFn } from '@tanstack/react-start'

export interface CurrentUser {
  id: string
  name: string
  email: string
  image: string | null
  githubUsername: string | null
}

export interface AuthenticationState {
  user: CurrentUser | null
  methods: {
    github: boolean
    google: boolean
    email: boolean
  }
}

export const getAuthenticationState = createServerFn({ method: 'GET' }).handler(
  async ({ context }): Promise<AuthenticationState> => {
    const services = context.getServices()
    const session = await services.getSession()

    return {
      user: session?.user
        ? {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            image: session.user.image ?? null,
            githubUsername: session.user.githubUsername ?? null,
          }
        : null,
      methods: {
        github: Boolean(services.configuration.auth.github),
        google: Boolean(services.configuration.auth.google),
        email: services.authenticationMethods.email,
      },
    }
  },
)
