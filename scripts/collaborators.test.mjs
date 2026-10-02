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
  await client.executeMultiple(`CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT NOT NULL);
    CREATE TABLE collaborator (id INTEGER PRIMARY KEY, type TEXT NOT NULL, installation_id INTEGER NOT NULL, owner_id INTEGER NOT NULL, repo_id INTEGER, owner TEXT NOT NULL, repo TEXT NOT NULL, branch TEXT, email TEXT NOT NULL, user_id TEXT REFERENCES user(id), invited_by TEXT REFERENCES user(id));
    CREATE UNIQUE INDEX collaborators_unique ON collaborator(lower(owner),lower(repo),lower(email));
    INSERT INTO user VALUES ('admin','admin@example.com'), ('person','person@example.com');`)
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
