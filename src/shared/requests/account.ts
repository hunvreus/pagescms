import { parseProfileRequest } from '#/lib/profile'

export function parseProfileMutation(input: unknown) {
  const profile = parseProfileRequest(input)
  const { accountId } = input as Record<string, unknown>
  if (typeof accountId !== 'string' || !accountId || accountId.length > 200)
    throw new Error('The profile account is missing')
  return { ...profile, accountId }
}

export function parseAccountDeletion(input: unknown) {
  if (typeof input !== 'object' || input === null)
    throw new Error('Invalid account deletion request.')
  const { accountId, email } = input as Record<string, unknown>
  if (typeof accountId !== 'string' || !accountId || accountId.length > 200)
    throw new Error('The account is missing.')
  if (typeof email !== 'string' || !email.trim() || email.length > 320)
    throw new Error('Enter your email to confirm account deletion.')
  return { accountId, email: email.trim().toLowerCase() }
}

export function parseAccountId(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('The account is missing.')
  const { accountId } = input as Record<string, unknown>
  if (typeof accountId !== 'string' || !accountId || accountId.length > 200)
    throw new Error('The account is missing.')
  return { accountId }
}
