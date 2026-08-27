import { describe, expect, it } from 'vitest'

import { createDatabase } from './client.server'

describe('createDatabase', () => {
  it('creates a typed Drizzle client without connecting eagerly', () => {
    const database = createDatabase({
      connectionString: 'postgres://user:password@example.com/pagescms',
    })

    expect(database.query.userTable).toBeDefined()
    expect(database.query.configTable).toBeDefined()
  })

  it('rejects missing connection details and invalid pool limits', () => {
    expect(() => createDatabase({ connectionString: ' ' })).toThrow(
      'connection string',
    )
    expect(() =>
      createDatabase({
        connectionString: 'postgres://example.com/pagescms',
        maxConnections: 0,
      }),
    ).toThrow('positive integer')
  })
})
