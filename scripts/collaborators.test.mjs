import { readFile, readdir } from 'node:fs/promises'
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  statSync,
  rmSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import {
  exportCollaborators,
  collaboratorsSql,
  postgresExportQuery,
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
  name: 'Person Name',
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
    const value = { ...row, repo: 'a,"quoted"\nbranch' }
    expect(parseCsv(stringifyCsv([value]))[0].repo).toBe(value.repo)
    expect(() => parseCsv('"unclosed')).toThrow()
    expect(() => parseCsv('type,unknown\n')).toThrow(
      'Unexpected collaborator CSV column',
    )
  })

  it('exports, imports, links users by email, and upserts case-insensitively', async () => {
    const client = await database()
    try {
      await importCollaborators(client, stringifyCsv([row]))
      await importCollaborators(
        client,
        stringifyCsv([{ ...row, owner: 'pagescms' }]),
      )
      const result = parseCsv(await exportCollaborators(client))
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        userId: 'person',
        name: 'Person Name',
        invitedBy: 'admin',
        invitedByEmail: 'admin@example.com',
      })
    } finally {
      client.close()
    }
  })

  it('leaves an assignment unbound until its account email is verified', async () => {
    const client = await database()
    try {
      await client.execute(
        "UPDATE user SET email_verified = 0 WHERE id = 'person'",
      )
      const csv = stringifyCsv([row])
      await importCollaborators(client, csv)
      await client.executeMultiple(collaboratorsSql(csv))
      expect(
        (await client.execute('SELECT user_id FROM collaborator')).rows,
      ).toEqual([{ user_id: null }])
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

  it('exports only active assignments and uses a fresh ID for a removed membership when importing', async () => {
    const client = await database()
    try {
      const createdAt = Date.parse('2026-10-16T01:02:03.456Z')
      await importCollaborators(client, stringifyCsv([{ ...row, createdAt }]))
      expect(parseCsv(await exportCollaborators(client))[0].createdAt).toBe(
        String(createdAt),
      )
      await client.execute('UPDATE collaborator SET pending = 1')
      expect(parseCsv(await exportCollaborators(client))).toEqual([])
      const [old] = (await client.execute('SELECT * FROM collaborator')).rows
      await client.execute({
        sql: 'DELETE FROM collaborator WHERE id = ?',
        args: [old.id],
      })
      expect(parseCsv(await exportCollaborators(client))).toHaveLength(0)
      await importCollaborators(
        client,
        stringifyCsv([{ ...row, createdAt: createdAt + 2000 }]),
      )
      await importCollaborators(client, stringifyCsv([row]))
      const rows = (
        await client.execute('SELECT * FROM collaborator ORDER BY id')
      ).rows
      expect(rows).toHaveLength(1)
      expect(rows[0].id).not.toBe(old.id)
      expect(rows[0]).toMatchObject({
        created_at: createdAt + 2000,
      })
      expect(parseCsv(await exportCollaborators(client))).toHaveLength(1)
    } finally {
      client.close()
    }
  })

  it('replaces active assignments atomically and revokes old invitations', async () => {
    const client = await database()
    try {
      await importCollaborators(client, stringifyCsv([row]))
      await client.execute({
        sql: 'INSERT INTO collaborator_invite (repo_id, owner, repo, email, token, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [
          row.repoId,
          row.owner,
          row.repo,
          row.email,
          'old-invite',
          Date.now() + 60_000,
        ],
      })
      const [old] = (await client.execute('SELECT * FROM collaborator')).rows
      await importCollaborators(
        client,
        stringifyCsv([{ ...row, email: 'fresh@example.com' }]),
        { replace: true },
      )
      const rows = (
        await client.execute('SELECT * FROM collaborator ORDER BY id')
      ).rows
      expect(rows).toHaveLength(1)
      expect(rows[0].id).not.toBe(old.id)
      expect(rows[0]).toMatchObject({
        email: 'fresh@example.com',
      })
      expect(
        (await client.execute('SELECT * FROM collaborator_invite')).rows,
      ).toHaveLength(0)
      expect(
        parseCsv(await exportCollaborators(client)).map(
          (member) => member.email,
        ),
      ).toEqual(['fresh@example.com'])
    } finally {
      client.close()
    }
  })
  it('prepares replayable D1/SQLite SQL with quoted data and destination email links', async () => {
    const client = await database()
    try {
      const csv = stringifyCsv([
        { ...row, name: "O'Brien; -- data", userId: 'admin' },
      ])
      const sql = collaboratorsSql(csv)
      await client.executeMultiple(sql)
      await client.executeMultiple(sql)
      const rows = (
        await client.execute(
          'SELECT email, name, user_id, invited_by, created_at FROM collaborator',
        )
      ).rows
      expect(rows).toEqual([
        {
          email: row.email,
          name: "O'Brien; -- data",
          user_id: 'person',
          invited_by: 'admin',
          created_at: null,
        },
      ])
      expect(sql).not.toContain('BEGIN')
      expect(postgresExportQuery).toContain(
        'TO STDOUT WITH (FORMAT CSV, HEADER TRUE)',
      )
      expect(postgresExportQuery).toContain('c.branch')
    } finally {
      client.close()
    }
  })

  it('refuses branch-scoped grants rather than widening access or replacing memberships', async () => {
    const client = await database()
    try {
      await importCollaborators(client, stringifyCsv([row]))
      const scoped = stringifyCsv([{ ...row, branch: 'restricted' }])
      expect(() => collaboratorsSql(scoped)).toThrow('refusing to widen access')
      await expect(
        importCollaborators(client, scoped, { replace: true }),
      ).rejects.toThrow('refusing to widen access')
      expect(parseCsv(await exportCollaborators(client))).toHaveLength(1)
    } finally {
      client.close()
    }
  })
  it('rejects an assignment without a repository ID before writing any assignments', async () => {
    const client = await database()
    try {
      const csv = stringifyCsv([row, { ...row, repoId: null }])
      await expect(importCollaborators(client, csv)).rejects.toThrow(
        'Invalid repoId at CSV row 3',
      )
      expect(() => collaboratorsSql(csv)).toThrow('Invalid repoId at CSV row 3')
      expect(parseCsv(await exportCollaborators(client))).toEqual([])
    } finally {
      client.close()
    }
  })
  it('exports through a read-only PostgreSQL client without exposing credentials or overwriting output', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pagescms-pg-export-'))
    try {
      const csv = stringifyCsv([row])
      writeFileSync(
        join(directory, 'psql'),
        `#!/usr/bin/env node
if (process.env.PGOPTIONS !== '-c default_transaction_read_only=on' || process.env.PGDATABASE !== 'database' || process.env.PGHOST !== 'source.example' || process.env.PGPASSWORD !== 'fake-secret') process.exit(2)
if (process.argv.some(arg => arg.includes('fake-secret'))) process.exit(3)
if (process.env.FAIL_EXPORT) { console.error(process.env.PGPASSWORD); process.exit(1) }
process.stdout.write(${JSON.stringify(csv)})
`,
        { mode: 0o700 },
      )
      const script = new URL('./collaborators.mjs', import.meta.url).pathname
      const env = {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        COLLABORATORS_SOURCE_URL:
          'postgresql://test:fake-secret@source.example/database',
      }
      const run = (args = [], overrides = {}, operation = 'export') =>
        spawnSync(process.execPath, [script, operation, ...args], {
          cwd: directory,
          encoding: 'utf8',
          env: { ...env, ...overrides },
        })
      const migrated = run(['--output=members.sql'], {}, 'migrate-2x')
      expect(migrated.status).toBe(0)
      expect(readFileSync(join(directory, 'members.sql'), 'utf8')).toContain(
        row.email,
      )
      writeFileSync(
        join(directory, '.env.local'),
        'COLLABORATORS_SOURCE_URL=postgresql://test:fake-secret@source.example/database\n',
      )
      const fromFile = run(
        ['--output=members-from-env.sql'],
        { COLLABORATORS_SOURCE_URL: undefined },
        'migrate-2x',
      )
      expect(fromFile.status).toBe(0)
      expect(
        readFileSync(join(directory, 'members-from-env.sql'), 'utf8'),
      ).toContain(row.email)
      writeFileSync(
        join(directory, '.env.local'),
        'COLLABORATORS_SOURCE_URL=invalid\n',
      )
      expect(
        run(['--output=members-override.sql'], {}, 'migrate-2x').status,
      ).toBe(0)
      const result = run(['--output=members.csv'])
      expect(result.status).toBe(0)
      expect(result.stdout + result.stderr).not.toContain('fake-secret')
      expect(
        parseCsv(readFileSync(join(directory, 'members.csv'), 'utf8')),
      ).toHaveLength(1)
      expect(statSync(join(directory, 'members.csv')).mode & 0o777).toBe(0o600)
      expect(run(['--output=members.csv']).status).toBe(1)
      const failed = run(['--output=failed.csv'], { FAIL_EXPORT: 'true' })
      expect(failed.status).toBe(1)
      expect(failed.stdout + failed.stderr).not.toContain('fake-secret')
      expect(failed.stderr).toContain('PostgreSQL export failed')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
