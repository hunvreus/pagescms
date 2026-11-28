import type { Locale } from '#/i18n/locale'
import type { Database } from '#/server/db/client'

import type {
  AccountPreferences,
  EditingPreferences,
} from '#/shared/account-preferences'
import { first } from '#/server/db/sql'

type StoredPreferences = { preferences: string }

export async function readAccountPreferences(
  database: Database,
  accountId: string,
) {
  const user = await first<StoredPreferences>(
    database,
    'SELECT preferences FROM user WHERE id = ?',
    [accountId],
  )
  if (!user) throw new Error('Account not found')
  return JSON.parse(user.preferences) as AccountPreferences
}
export async function updateAccountPreferences(
  database: Database,
  accountId: string,
  editing: EditingPreferences,
) {
  const row = await first<StoredPreferences>(
    database,
    "UPDATE user SET preferences = json_set(preferences, '$.editing.newTranslations', ?), updated_at = ? WHERE id = ? RETURNING preferences",
    [editing.newTranslations, Date.now(), accountId],
  )
  if (!row) throw new Error('Account not found')
  return JSON.parse(row.preferences) as AccountPreferences
}

export async function updateAccountLanguage(
  database: Database,
  accountId: string,
  language: Locale,
) {
  const row = await first<StoredPreferences>(
    database,
    `UPDATE user SET preferences = json_set(preferences, '$.language', ?), updated_at = ? WHERE id = ? RETURNING preferences`,
    [language, Date.now(), accountId],
  )
  if (!row) throw new Error('Account not found')
  return JSON.parse(row.preferences) as AccountPreferences
}
