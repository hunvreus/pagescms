import { preferredLocale } from '#/i18n/locale'
import { readAccountPreferences } from '#/server/account/preferences'
import { isDeploymentAdmin } from '#/server/admin/access'
import { localAccountReceipt } from '#/server/services/local-account-data'
import type { RequestServices } from '#/server/context'
import type { AuthenticationState } from '#/lib/authentication'

export async function authenticationState(
  services: RequestServices,
  cookie?: string,
  acceptLanguage?: string,
): Promise<AuthenticationState> {
  const session = await services.getSession()
  const preferences = session?.user
    ? 'preferences' in session.user && session.user.preferences != null
      ? session.user.preferences
      : await readAccountPreferences(services.database, session.user.id).catch(
          () => undefined,
        )
    : undefined
  const language =
    preferences && typeof preferences === 'object' && 'language' in preferences
      ? preferences.language
      : undefined
  const locale =
    preferredLocale(language, cookie, acceptLanguage) ??
    services.configuration.defaultLanguage
  return {
    locale,
    ...(session?.user
      ? {
          localDataReceipt: await localAccountReceipt(
            session.user.id,
            services.configuration.auth.secret,
          ),
        }
      : {}),
    profileCompleted: Boolean(session?.user.onboardingCompletedAt),
    user: session?.user
      ? {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          image: session.user.image ?? null,
          githubUsername: session.user.githubUsername ?? null,
        }
      : null,
    isAdmin: Boolean(
      session?.user &&
      isDeploymentAdmin(session.user, services.configuration.adminEmails),
    ),
    methods: {
      github: Boolean(services.configuration.auth.github),
      google: Boolean(services.configuration.auth.google),
      email: services.authenticationMethods.email,
    },
  }
}
