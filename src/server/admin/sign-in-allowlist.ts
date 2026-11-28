import { all, first } from '#/server/db/sql'
import { executeAtomic } from '#/server/db/core'
import type { Database } from '#/server/db/client'
import type {
  parseAllowlistAction,
  parseAllowlistSearch,
} from '#/shared/requests/admin'
import type { AllowlistRule } from '#/shared/sign-in-allowlist'

export async function loadAllowlist(
  database: Database,
  input: ReturnType<typeof parseAllowlistSearch>,
) {
  const query = input.query.replace(/[\\%_]/g, '\\$&')
  const where = query
    ? " WHERE value LIKE ? ESCAPE '\\' OR type LIKE ? ESCAPE '\\'"
    : ''
  const args = query ? [`%${query}%`, `%${query}%`] : []
  const total = Number(
    (
      await first<{ count: number }>(
        database,
        `SELECT count(*) AS count FROM sign_in_allowlist${where}`,
        args,
      )
    )?.count ?? 0,
  )
  const pages = Math.max(1, Math.ceil(total / 20))
  const page = Math.min(input.page, pages)
  const rules = await all<AllowlistRule & { id: string; createdAt: number }>(
    database,
    `SELECT id, type, value, created_at AS createdAt FROM sign_in_allowlist${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...args, 20, (page - 1) * 20],
  )
  return { rules, total, page, pages, query: input.query }
}

export async function changeAllowlist(
  database: Database,
  input: ReturnType<typeof parseAllowlistAction>,
) {
  if (input.action === 'remove') {
    await executeAtomic(database, [
      { sql: 'DELETE FROM sign_in_allowlist WHERE id = ?', args: [input.id] },
    ])
    return
  }
  const entries =
    input.action === 'add'
      ? [input.rule]
      : input.emails.map((value) => ({ type: 'email', value }))
  const rows = entries.map((entry) => ({ id: crypto.randomUUID(), ...entry }))
  await executeAtomic(database, [
    {
      sql: "INSERT INTO sign_in_allowlist (id, type, value) SELECT json_extract(value, '$.id'), json_extract(value, '$.type'), json_extract(value, '$.value') FROM json_each(?) WHERE true ON CONFLICT(type, value) DO NOTHING",
      args: [JSON.stringify(rows)],
    },
  ])
}
