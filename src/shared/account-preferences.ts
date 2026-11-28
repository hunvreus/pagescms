import type { Locale } from '#/i18n/locale'

export type EditingPreferences = {
  newTranslations: 'ask' | 'blank' | 'copy'
}
export type AccountPreferences = {
  editing?: EditingPreferences
  language?: Locale
}
export function resolveEditingPreferences(
  value?: AccountPreferences,
): EditingPreferences {
  return {
    newTranslations:
      value?.editing?.newTranslations === 'blank' ||
      value?.editing?.newTranslations === 'copy'
        ? value.editing.newTranslations
        : 'ask',
  }
}
export function parsePreferencesUpdate(input: unknown): {
  accountId: string
  editing: EditingPreferences
} {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid preferences.')
  const value = input as Record<string, unknown>
  if (
    typeof value.accountId !== 'string' ||
    !value.accountId ||
    value.accountId.length > 200
  )
    throw new Error('The account is missing.')
  if (
    Object.keys(value).some((key) => !['accountId', 'editing'].includes(key)) ||
    !value.editing ||
    typeof value.editing !== 'object' ||
    Array.isArray(value.editing)
  )
    throw new Error('Invalid preferences.')
  const editing = value.editing as Record<string, unknown>
  if (
    Object.keys(editing).length !== 1 ||
    !Object.hasOwn(editing, 'newTranslations')
  )
    throw new Error('Invalid editing preferences.')
  const { newTranslations } = editing
  if (
    newTranslations !== 'ask' &&
    newTranslations !== 'blank' &&
    newTranslations !== 'copy'
  )
    throw new Error('Invalid translation preference.')
  return { accountId: value.accountId, editing: { newTranslations } }
}
