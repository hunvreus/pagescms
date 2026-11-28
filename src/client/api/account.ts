import type {
  readSettings as settings,
  saveProfile,
  deleteAccount as remove,
  savePreferences,
  readPreferences,
} from '#/server/services/account'
import { apiMutation, apiQuery, readApi } from '#/client/api/index'
import type { Locale } from '#/i18n/locale'
import type { saveAccountLanguage } from '#/server/services/account-language'

export function getAccountSettings(): ReturnType<typeof settings> {
  return readApi('/api/account/settings')
}
export const updateProfile = apiMutation<
  unknown,
  Awaited<ReturnType<typeof saveProfile>>
>('/api/account', 'PATCH')
export const deleteAccount = apiMutation<
  unknown,
  Awaited<ReturnType<typeof remove>>
>('/api/account', 'DELETE')
export const getAccountPreferences = (
  input: unknown,
): Promise<Awaited<ReturnType<typeof readPreferences>>> =>
  apiQuery('/api/account/preferences', input)
export const saveAccountPreferences = apiMutation<
  unknown,
  Awaited<ReturnType<typeof savePreferences>>
>('/api/account/preferences', 'PATCH')

export const saveLanguage = apiMutation<
  { accountId: string; language: Locale },
  Awaited<ReturnType<typeof saveAccountLanguage>>
>('/api/account/language', 'PATCH')
