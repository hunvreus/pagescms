const denialReasons = [
  'authentication_required',
  'permission_denied',
  'plan_required',
  'quota_exceeded',
  'feature_unavailable',
  'policy_unavailable',
] as const

export type ClientAccessDenialReason = (typeof denialReasons)[number]

const messages: Record<ClientAccessDenialReason, string> = {
  authentication_required: 'Sign in to continue.',
  permission_denied: 'You do not have permission to do this.',
  plan_required: 'This action requires a paid plan.',
  quota_exceeded: 'This plan has reached its usage limit.',
  feature_unavailable: 'This feature is not available for this account.',
  policy_unavailable: 'Account access could not be verified. Try again later.',
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

function reason(value: unknown): ClientAccessDenialReason | undefined {
  return typeof value === 'string' &&
    denialReasons.includes(value as ClientAccessDenialReason)
    ? (value as ClientAccessDenialReason)
    : undefined
}

function safeUpgradeUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined
  } catch {
    return
  }
}

export function accessDenialFrom(error: unknown) {
  const value = record(error)
  const nested = record(value?.data)
  const message =
    typeof value?.message === 'string'
      ? value.message
      : typeof nested?.message === 'string'
        ? nested.message
        : ''
  const parsedReason =
    reason(value?.reason) ??
    reason(nested?.reason) ??
    reason(message.match(/^Access denied: ([a-z_]+)$/)?.[1])
  if (!parsedReason) return
  return {
    reason: parsedReason,
    message: messages[parsedReason],
    upgradeUrl: safeUpgradeUrl(value?.upgradeUrl ?? nested?.upgradeUrl),
  }
}

export function userFacingError(error: unknown, fallback: string) {
  const denial = accessDenialFrom(error)
  if (denial) return denial.message
  if (!(error instanceof Error)) return fallback

  const message = error.message.trim().toLowerCase()
  const transportFailure =
    error.name === 'AbortError' ||
    message === 'aborted' ||
    message === 'fetch failed' ||
    message === 'failed to fetch' ||
    message === 'load failed' ||
    message === 'network request failed' ||
    message === 'networkerror when attempting to fetch resource.' ||
    message.includes('econnreset')

  return transportFailure ? fallback : error.message
}
