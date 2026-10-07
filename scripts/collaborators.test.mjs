import { readFile, readdir } from 'node:fs/promises'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import {
  exportCollaborators,
  importCollaborators,
  parseCsv,
  stringifyCsv,
} from './collaborators.mjs'

const row = {
  type: 'repo',
  installationId: 1,
  ownerId: 2,
  repoId: 3,
  owner: 'PagesCMS',
  repo: 'Test',
  email: 'person@example.com',
  invitedByEmail: 'admin@example.com',
}

async function database() {
  const client = createClient({ url: 'file::memory:' })
  const directory = new URL('../drizzle/', import.meta.url)
  for (const name of (await readdir(directory))
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    await client.executeMultiple(
      await readFile(new URL(name, directory), 'utf8'),
    )
  }
  await client.executeMultiple(
    `INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('admin','Admin','admin@example.com',1,unixepoch(),unixepoch()), ('person','Person','person@example.com',1,unixepoch(),unixepoch());`,
  )
  return client
}

describe('collaborator migration', () => {
  it('round-trips CSV quotes, commas, and multiline values', () => {
    const value = { ...row, branch: 'a,"quoted"\nbranch' }
    expect(parseCsv(stringifyCsv([value]))[0].branch).toBe(value.branch)
    expect(() => parseCsv('"unclosed')).toThrow()
  })

  it('exports, imports, links users by email, and upserts case-insensitively', async () => {
    const client = await database()
    try {
      await importCollaborators(client, stringifyCsv([row]))
      await importCollaborators(
        client,
        stringifyCsv([{ ...row, owner: 'pagescms', branch: 'main' }]),
      )
      const result = parseCsv(await exportCollaborators(client))
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        userId: 'person',
        invitedBy: 'admin',
        invitedByEmail: 'admin@example.com',
        branch: 'main',
      })
    } finally {
      client.close()
    }
  })

  it('validates all rows before replace and rolls back a failed batch', async () => {
    const client = await database()
    try {
      await importCollaborators(client, stringifyCsv([row]))
      await expect(
        importCollaborators(
          client,
          stringifyCsv([row, { ...row, email: 'bad' }]),
          { replace: true },
        ),
      ).rejects.toThrow(/email/)
      expect(parseCsv(await exportCollaborators(client))).toHaveLength(1)
      await client.executeMultiple(
        `CREATE TRIGGER reject_import BEFORE INSERT ON collaborator WHEN NEW.email = 'reject@example.com' BEGIN SELECT RAISE(ABORT, 'Rejected import'); END;`,
      )
      await expect(
        importCollaborators(
          client,
          stringifyCsv([
            { ...row, email: 'new@example.com' },
            { ...row, email: 'reject@example.com' },
          ]),
          { replace: true },
        ),
      ).rejects.toThrow(/Rejected import/)
      expect(parseCsv(await exportCollaborators(client))).toEqual(
        expect.arrayContaining([expect.objectContaining({ email: row.email })]),
      )
      expect(parseCsv(await exportCollaborators(client))).toHaveLength(1)
      await expect(
        importCollaborators(client, stringifyCsv([]), { replace: true }),
      ).rejects.toThrow(/no collaborators/)
      expect(parseCsv(await exportCollaborators(client))).toHaveLength(1)
    } finally {
      client.close()
    }
  })
})
