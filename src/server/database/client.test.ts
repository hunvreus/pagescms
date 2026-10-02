import { describe, expect, it } from 'vitest'

import { createDatabase } from './client.server'

describe('createDatabase', () => {
  it('creates a typed Drizzle client without connecting eagerly', () => {
    const database = createDatabase({ url: 'file::memory:' })

    expect(database.query.userTable).toBeDefined()
    expect(database.query.configTable).toBeDefined()
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
