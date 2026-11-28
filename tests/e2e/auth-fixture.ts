import { encryptOAuthToken } from '#/server/auth/oauth-token-crypto'

export const authSecret = 'playwright-only-auth-secret-at-least-32-characters'

export function encryptFixtureToken(data: string) {
  return encryptOAuthToken(data, authSecret)
}
