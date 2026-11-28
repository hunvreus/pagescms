import { getTableColumns } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'

import * as schema from '#/server/db/schema'

describe('database schema', () => {
  it('keeps core collaborators repository-wide', () => {
    expect(getTableColumns(schema.collaboratorTable)).not.toHaveProperty(
      'branch',
    )
  })

  it('uses the Better Auth 1.7 external account identity', () => {
    expect(getTableColumns(schema.accountTable)).toMatchObject({
      providerId: { name: 'provider_id', notNull: true },
    })
    expect(
      getTableConfig(schema.accountTable).indexes.map((index) => ({
        name: index.config.name,
        unique: index.config.unique,
      })),
    ).toContainEqual({
      name: 'account_providerId_accountId_uidx',
      unique: true,
    })
  })
})
