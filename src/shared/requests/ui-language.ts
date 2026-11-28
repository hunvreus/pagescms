import { isLocale } from '#/i18n/locale'

export function parseLanguageUpdate(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid language preference.')
  const { accountId, language } = input as Record<string, unknown>
  if (
    typeof accountId !== 'string' ||
    !accountId ||
    accountId.length > 200 ||
    !isLocale(language)
  )
    throw new Error('Invalid language preference.')
  return { accountId, language }
}
