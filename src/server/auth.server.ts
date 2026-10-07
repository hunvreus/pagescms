import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'
import { emailOTP } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import type { AuthRuntimeConfiguration } from './runtime-config.server'
import type { Database } from './database/client.server'
import type { EmailProvider } from './email.server'

import {
  accountTable,
  sessionTable,
  userTable,
  verificationTable,
} from './database/schema'
import { createLoginCodeEmail } from './email-templates.server'
import { syncGitHubProfile } from './github-account.server'
import { logServerEvent, serverErrorDetails } from './http'

export { createLoginCodeEmail } from './email-templates.server'

export function authBaseUrl(baseUrl: string) {
  const url = new URL(baseUrl)
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]'
  ) {
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
}: {
  database: Database
  configuration: AuthRuntimeConfiguration
  emailProvider?: EmailProvider
}) {
  return betterAuth({
    baseURL: authBaseUrl(configuration.baseUrl),
    secret: configuration.secret,
    user: {
      validateUserInfo: ({ user, source }) => {
        if (source.method === 'oauth' && user.emailVerified !== true) {
          return {
            error: 'email_not_verified',
            errorDescription:
              'Verify your email with your sign-in provider before continuing.',
          }
        }
      },
      additionalFields: {
        githubUsername: {
          type: 'string',
          required: false,
          input: false,
        },
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: [],
        updateUserInfoOnLink: true,
        allowUnlinkingAll: false,
      },
    },
    socialProviders: configuration.github
      ? {
          github: {
            requireEmailVerification: true,
            clientId: configuration.github.clientId,
            clientSecret: configuration.github.clientSecret,
            overrideUserInfoOnSignIn: false,
            mapProfileToUser: (profile) => ({
              name: (profile as { name?: string | null }).name ?? profile.login,
              image:
                (profile as { avatar_url?: string | null }).avatar_url ??
                undefined,
              githubUsername: profile.login,
            }),
            scope: ['repo', 'user:email'],
          },
        }
      : {},
    database: drizzleAdapter(database, {
      provider: 'sqlite',
      schema: {
        user: userTable,
        session: sessionTable,
        account: accountTable,
        verification: verificationTable,
      },
    }),
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            try {
              await syncGitHubProfile(database, session.userId)
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
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== 'sign-in') return
          if (!emailProvider) throw new Error('Email provider is unavailable')
          await emailProvider.send(
            createLoginCodeEmail({
              baseUrl: configuration.baseUrl,
              email,
              otp,
            }),
          )
        },
      }),
      tanstackStartCookies(),
    ],
  })
}

export type PagesCmsAuth = ReturnType<typeof createPagesCmsAuth>
