import { z } from 'zod'
import { parseCollaboratorEmails } from '#/lib/collaborator-invites'

const email = z.email().max(320)

export const allowlistRuleSchema = z
  .object({
    type: z.enum(['email', 'domain', 'pattern']),
    value: z.string().trim().min(1).max(255),
  })
  .superRefine(({ type, value }, context) => {
    const valid =
      type === 'email'
        ? email.safeParse(value).success
        : type === 'domain'
          ? email.safeParse(`member@${value.replace(/^@/, '')}`).success
          : isValidPattern(value)
    if (!valid)
      context.addIssue({ code: 'custom', message: 'Invalid allowlist rule.' })
  })
  .transform(({ type, value }) => ({
    type,
    value:
      type === 'pattern'
        ? value
        : type === 'domain'
          ? value.toLowerCase().replace(/^@/, '')
          : value.toLowerCase(),
  }))

export type AllowlistRule = z.infer<typeof allowlistRuleSchema>

function isValidPattern(value: string) {
  try {
    new RegExp(value)
    return true
  } catch {
    return false
  }
}

export function parseAllowlistEmails(input: string) {
  if (input.length > 20_000) throw new Error('Email list is too long')
  let values: string[]
  try {
    values = parseCollaboratorEmails(input)
  } catch {
    throw new Error('Invalid email list')
  }
  if (!values.length || values.some((value) => !email.safeParse(value).success))
    throw new Error('Invalid email list')
  return values
}

export function isEmailAllowed(
  emailAddress: string,
  rules: readonly AllowlistRule[],
  isPatternSafe: (pattern: string) => boolean,
) {
  const normalized = emailAddress.trim().toLowerCase()
  if (!normalized) return false
  if (!rules.length) return true
  const domain = normalized.split('@')[1] ?? ''
  return rules.some((rule) => {
    if (rule.type === 'email') return rule.value.toLowerCase() === normalized
    if (rule.type === 'domain')
      return rule.value.toLowerCase().replace(/^@/, '') === domain
    try {
      return (
        isPatternSafe(rule.value) &&
        new RegExp(`^(?:${rule.value})$`, 'i').test(normalized)
      )
    } catch {
      return false
    }
  })
}
