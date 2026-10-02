import { sql } from 'drizzle-orm'

import type { Database } from './database/client.server'

export async function checkDatabaseReadiness(
  database: Database,
  timeoutMs = 2_000,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const query = database.run(sql`select 1`)
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Database readiness check timed out')),
      timeoutMs,
    )
  })

  try {
    await Promise.race([query, deadline])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
