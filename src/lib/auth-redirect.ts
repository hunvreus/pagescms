const FALLBACK_REDIRECT = '/'

export function getSafeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    return FALLBACK_REDIRECT
  }
  if (value.startsWith('//') || value.includes('\\')) {
    return FALLBACK_REDIRECT
  }

  try {
    const url = new URL(value, 'https://app.pagescms.org')
    if (url.origin !== 'https://app.pagescms.org') return FALLBACK_REDIRECT
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return FALLBACK_REDIRECT
  }
}

export function getSignInUrl(redirectTo: string): string {
  const safeRedirect = getSafeRedirect(redirectTo)
  return safeRedirect === FALLBACK_REDIRECT
    ? '/sign-in'
    : `/sign-in?redirect=${encodeURIComponent(safeRedirect)}`
}
