import type { I18n } from '@lingui/core'
import type { UiMessage } from './message'

export interface ErrorTranslation {
  source: string
  message: Exclude<UiMessage, string>
  pattern?: RegExp
  values?: readonly string[]
}
interface RegisteredErrors {
  exact: Map<string, ErrorTranslation>
  patterns: Array<{ entry: ErrorTranslation; anchor: string }>
}
// Lingui exposes a new Proxy of the same instance after each activation.
// An instance-owned symbol remains visible through those proxies, unlike a WeakMap key.
const translations = Symbol('pagescms.error-translations')
type TranslatedI18n = I18n & { [translations]?: RegisteredErrors }
let browserI18n: I18n | undefined

/** Only the browser notification bridge uses this; SSR always passes its request instance. */
export function bindBrowserI18n(i18n: I18n) {
  browserI18n = i18n
}
export function browserTranslator() {
  return browserI18n
}
export function registerErrorTranslations(
  i18n: I18n,
  entries: readonly ErrorTranslation[],
) {
  ;(i18n as TranslatedI18n)[translations] = {
    exact: new Map(entries.map((entry) => [entry.source, entry])),
    patterns: entries
      .filter((entry) => entry.pattern)
      .sort(
        (a, b) =>
          b.source.replace(/\{\w+\}/g, '').length -
          a.source.replace(/\{\w+\}/g, '').length,
      )
      .map((entry) => ({
        entry,
        anchor: entry.source
          .split(/\{\w+\}/)
          .sort((a, b) => b.length - a.length)[0],
      })),
  }
}
export function localizeErrorMessage(
  i18n: I18n | undefined,
  value: string,
): string {
  if (!i18n) return value
  const registered = (i18n as TranslatedI18n)[translations]
  const exact = registered?.exact.get(value)
  if (exact) return i18n._(exact.message)
  // Unknown provider diagnostics remain data, never arbitrary translation IDs.
  if (value.length > 4096) return value
  for (const { entry, anchor } of registered?.patterns ?? []) {
    if (!value.includes(anchor)) continue
    entry.pattern!.lastIndex = 0
    const match = entry.pattern!.exec(value)
    if (match)
      return i18n._({
        ...entry.message,
        values: Object.fromEntries(
          (entry.values ?? []).map((key, index) => [key, match[index + 1]]),
        ),
      })
  }
  return value
}
