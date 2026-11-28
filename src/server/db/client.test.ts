import { describe, expect, it } from 'vitest'

import { first } from '#/server/db/sql'
import { createDatabase } from '#/server/db/client'

describe('createDatabase', () => {
  it('creates a typed Drizzle client without connecting eagerly', () => {
    const database = createDatabase({ url: 'file::memory:' })

    expect(database.query.userTable).toBeDefined()
    expect(database.query.configTable).toBeDefined()
  })

  it('configures a bounded lock wait on local SQLite connections', async () => {
    const db = createDatabase({ url: 'file::memory:' })
    expect(await first(db, 'PRAGMA busy_timeout', [])).toMatchObject({
      timeout: 1000,
    })
  })

  it('rejects missing connection details and local auth tokens', () => {
    expect(() => createDatabase({ url: ' ' })).toThrow('database URL')
    expect(() =>
      createDatabase({
        url: 'file::memory:',
        authToken: 'not-valid-for-local-sqlite',
      }),
    ).toThrow('do not accept an auth token')
  })
})
