import { isLoopbackHostname } from '#/server/csrf'
import { localeCookie, preferredLocale } from '#/i18n/locale'
import { createGitHubAccountReader } from '#/server/auth/oauth-account'
import { encryptAccountTokens } from '#/server/auth/oauth-token-crypto'
import { withOAuthTokenReads } from '#/server/auth/oauth-token-adapter'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { z } from 'zod'
import type { BetterAuthPlugin } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'

import type { AuthRuntimeConfiguration } from '#/server/runtime-config'
import type { Database } from '#/server/db/client'
import type { EmailProvider } from '#/server/email/email'
import type { PluginAuthExtension } from '#/plugins/server'

import {
  accountTable,
  sessionTable,
  userTable,
  verificationTable,
  rateLimitTable,
} from '#/server/db/schema'
import { createLoginCodeEmail } from '#/server/email/templates'
import { syncGitHubProfile } from '#/server/github/account'
import { logServerEvent, serverErrorDetails } from '#/server/http'
import { consumeLoginEmail } from '#/server/auth/rate-limit'
import {
  assertEmailCanSignIn,
  assertUserCanSignIn,
  emailCanSignIn,
} from '#/server/auth/sign-in-allowlist'

export { createLoginCodeEmail } from '#/server/email/templates'

const loginOtpBody = z.object({
  type: z.literal('sign-in'),
  email: z
    .string()
    .transform((value) => value.toLowerCase())
    .pipe(z.email()),
})

export function authBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl)
  if (isLoopbackHostname(url.hostname)) {
    return {
      allowedHosts: ['localhost:*', '127.0.0.1:*', '[::1]:*'],
      fallback: baseUrl,
      protocol: 'http' as const,
    }
  }
  return baseUrl
}

export function createPagesCmsAuth({
  database,
  configuration,
  emailProvider,
  extension,
}: {
  database: Database
  configuration: AuthRuntimeConfiguration
  emailProvider?: EmailProvider
  /** Deployment plugin additions; core models and plugins are always present. */
  extension?: PluginAuthExtension
}) {
  const adapter = drizzleAdapter(database, {
    provider: 'sqlite',
    schema: {
      user: userTable,
      session: sessionTable,
      account: accountTable,
      verification: verificationTable,
      rateLimit: rateLimitTable,
      ...extension?.schema,
    },
  })
  const auth = betterAuth({
    baseURL: authBaseUrl(configuration.baseUrl),
    secret: configuration.secret,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: configuration.sessionCacheSeconds ?? 60,
      },
    },
    rateLimit: { enabled: true, storage: 'database' },
    advanced: {
      database: { validateSchema: false },
      ...(configuration.clientIpHeader
        ? { ipAddress: { ipAddressHeaders: [configuration.clientIpHeader] } }
        : {}),
    },
    disabledPaths: [
      '/email-otp/check-verification-otp',
      '/email-otp/verify-email',
      '/email-otp/request-password-reset',
      '/forget-password/email-otp',
      '/email-otp/reset-password',
      '/email-otp/request-email-change',
      '/email-otp/change-email',
      '/get-access-token',
      '/refresh-token',
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/email-otp/send-verification-otp') return
        const body: unknown = ctx.body
        const parsed = loginOtpBody.safeParse(body)
        if (!parsed.success)
          throw new APIError('BAD_REQUEST', {
            message: 'Invalid sign-in email',
          })
        if (!(await emailCanSignIn(database, parsed.data.email)))
          throw new APIError('FORBIDDEN', {
            message: 'This email address is not allowed to sign in.',
          })
        await consumeLoginEmail(
          database,
          parsed.data.email,
          configuration.secret,
        )
      }),
    },
    user: {
      validateUserInfo: async ({ user, source }) => {
        if (source.method === 'oauth' && user.emailVerified !== true) {
          return {
            error: 'email_not_verified',
            errorDescription:
              'Verify your email with your sign-in provider before continuing.',
          }
        }
        if (
          source.method === 'oauth' &&
          (!user.email || !(await emailCanSignIn(database, user.email)))
        )
          return {
            error: 'access_denied',
            errorDescription: 'This email address is not allowed to sign in.',
          }
      },
      additionalFields: {
        preferences: { type: 'json', required: false, input: false },
        onboardingCompletedAt: { type: 'date', required: false, input: false },
        githubUsername: {
          type: 'string',
          required: false,
          input: false,
        },
      },
    },
    account: {
      encryptOAuthTokens: false,
      accountLinking: {
        enabled: true,
        trustedProviders: [],
        updateUserInfoOnLink: false,
        allowUnlinkingAll: false,
      },
    },
    socialProviders: {
      ...(configuration.github
        ? {
            github: {
              requireEmailVerification: true,
              clientId: configuration.github.clientId,
              clientSecret: configuration.github.clientSecret,
              overrideUserInfoOnSignIn: false,
              mapProfileToUser: (profile) => ({
                name:
                  (profile as { name?: string | null }).name ?? profile.login,
                image:
                  (profile as { avatar_url?: string | null }).avatar_url ??
                  undefined,
                githubUsername: profile.login,
              }),
              scope: ['repo', 'user:email'],
            },
          }
        : {}),
      ...(configuration.google
        ? {
            google: {
              clientId: configuration.google.clientId,
              clientSecret: configuration.google.clientSecret,
              overrideUserInfoOnSignIn: false,
              disableDefaultScope: true,
              scope: ['openid', 'email', 'profile'],
            },
          }
        : {}),
    },
    database: (options: Parameters<typeof adapter>[0]) =>
      withOAuthTokenReads(adapter(options), configuration.secret),
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            await assertEmailCanSignIn(database, user.email)
          },
        },
      },
      account: {
        create: {
          before: async (account) => ({
            data: await encryptAccountTokens(account, configuration.secret),
          }),
        },
        update: {
          before: async (account) => ({
            data: await encryptAccountTokens(account, configuration.secret),
          }),
        },
      },
      session: {
        create: {
          before: async (session) => {
            await assertUserCanSignIn(database, session.userId)
          },
          after: async (session): Promise<void> => {
            try {
              const readAccount = createGitHubAccountReader(
                database,
                configuration.secret,
              )
              const account = await readAccount(session.userId)
              await syncGitHubProfile(
                database,
                session.userId,
                account?.accessToken ?? null,
              )
            } catch (error) {
              logServerEvent('error', {
                event: 'github_profile_sync_failed',
                userId: session.userId,
                ...serverErrorDetails(error),
              })
            }
          },
        },
      },
    },
    onAPIError: {
      errorURL: '/auth/error',
    },
    plugins: [
      emailOTP({
        expiresIn: 300,
        otpLength: 6,
        allowedAttempts: 5,
        storeOTP: 'encrypted',
        resendStrategy: 'reuse',
        sendVerificationOTP: async ({ email, otp, type }, ctx) => {
          if (type !== 'sign-in') return
          if (!emailProvider) throw new Error('Email provider is unavailable')
          await emailProvider.send(
            createLoginCodeEmail({
              baseUrl: configuration.baseUrl,
              email,
              otp,
              locale:
                preferredLocale(
                  undefined,
                  ctx?.getCookie(localeCookie),
                  (ctx?.headers ?? ctx?.request?.headers)?.get(
                    'accept-language',
                  ) ?? '',
                ) ??
                configuration.defaultLanguage ??
                'en',
            }),
          )
        },
      }),
      // Validated as plugin objects at composition; see AuthPluginContribution.
      ...((extension?.plugins ?? []) as readonly BetterAuthPlugin[]),
    ],
  })

  return auth
}

export type PagesCmsAuth = ReturnType<typeof createPagesCmsAuth>
