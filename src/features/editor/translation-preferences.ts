import { accountWasDeleted } from '#/features/account/local-account-storage'

function key(account: string, scope: string) {
  return `pagescms:translation-preference:${JSON.stringify([account, scope])}`
}
export function translationPreference(
  account: string | undefined,
  scope: string,
): string | null {
  if (!account || accountWasDeleted(account)) return null
  try {
    return localStorage.getItem(key(account, scope))
  } catch {
    return null
  }
}
export function rememberTranslationPreference(
  account: string | undefined,
  scope: string,
  value: string,
) {
  if (!account || accountWasDeleted(account)) return
  try {
    localStorage.setItem(key(account, scope), value)
    return true
  } catch {
    /* Preferences must not block editing. */
    return false
  }
}
export function clearTranslationPreferences(account: string) {
  try {
    const prefix = 'pagescms:translation-preference:'
    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    )
    for (const item of keys) {
      if (!item?.startsWith(prefix)) continue
      const parts: unknown = JSON.parse(item.slice(prefix.length))
      if (Array.isArray(parts) && parts[0] === account)
        localStorage.removeItem(item)
    }
  } catch {
    /* Optional browser storage may be unavailable. */
  }
}

export function collectionLocalePreference(
  account: string | undefined,
  scope: string,
  i18n: { locales: { code: string }[] } | null | undefined,
) {
  if (!i18n) return null
  const remembered = translationPreference(account, scope)
  return i18n.locales.some((item) => item.code === remembered)
    ? remembered
    : null
}
