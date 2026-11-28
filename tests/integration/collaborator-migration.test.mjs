import { readFile, readdir } from 'node:fs/promises'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'
import { collaboratorsSql, stringifyCsv } from '../../scripts/collaborators.mjs'

it('imports prepared collaborator SQL into migrated local D1 without transferring legacy identities', async () => {
  const runtime = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("fixture") } }',
    d1Databases: ['DATABASE'],
  })
  try {
    const database = await runtime.getD1Database('DATABASE')
    const directory = new URL('../../drizzle/', import.meta.url)
    for (const file of (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const sql = await readFile(new URL(file, directory), 'utf8')
      await database.batch(
        sql
          .split('--> statement-breakpoint')
          .filter((part) => part.trim())
          .map((part) => database.prepare(part)),
      )
    }
    const row = {
      type: 'repo',
      installationId: 1,
      ownerId: 2,
      repoId: 3,
      owner: 'example',
      repo: 'site',
      email: 'editor@example.com',
      name: "O'Brien",
      userId: 'legacy-id',
      invitedBy: 'legacy-admin',
    }
    const sql = collaboratorsSql(stringifyCsv([row]))
    await database.prepare(sql).run()
    await database.prepare(sql).run()
    const result = await database
      .prepare('select email, name, user_id, invited_by from collaborator')
      .all()
    expect(result.results).toEqual([
      { email: row.email, name: row.name, user_id: null, invited_by: null },
    ])
    expect(
      (await database.prepare('select count(*) as count from user').first())
        .count,
    ).toBe(0)
  } finally {
    await runtime.dispose()
  }
}, 30_000)
