import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { betterAuth } from 'better-auth/minimal'
import { emailOTP } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import type { AuthRuntimeConfiguration } from './runtime-config.server'
import type { Database } from './database/client.server'
import type { EmailMessage, EmailProvider } from './email.server'

import {
  accountTable,
  sessionTable,
  userTable,
  verificationTable,
} from './database/schema'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function createLoginCodeEmail(email: string, otp: string): EmailMessage {
  const subject = `Your Pages CMS temporary code is ${otp}`
  return {
    to: email,
    subject,
    text: `Your Pages CMS temporary sign-in code is ${otp}. It expires in five minutes.`,
    html: `<p>Your Pages CMS temporary sign-in code for ${escapeHtml(email)} is:</p><p><strong>${escapeHtml(otp)}</strong></p><p>It expires in five minutes.</p>`,
  }
}

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
        trustedProviders: ['github'],
        updateUserInfoOnLink: true,
        allowUnlinkingAll: false,
      },
    },
    socialProviders: configuration.github
      ? {
          github: {
            clientId: configuration.github.clientId,
            clientSecret: configuration.github.clientSecret,
            overrideUserInfoOnSignIn: false,
            mapProfileToUser: (profile) => ({
              name: profile.name,
              image: profile.avatar_url,
              githubUsername: profile.login,
            }),
            scope: ['repo', 'user:email'],
          },
        }
      : {},
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: {
        user: userTable,
        session: sessionTable,
        account: accountTable,
        verification: verificationTable,
      },
    }),
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
          await emailProvider.send(createLoginCodeEmail(email, otp))
        },
      }),
      tanstackStartCookies(),
    ],
  })
}

export type PagesCmsAuth = ReturnType<typeof createPagesCmsAuth>
