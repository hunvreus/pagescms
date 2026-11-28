import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { defineConfig, definePlugin } from './config'
import {
  assertMigrationFolder,
  migratePackage,
  migrationJournal,
} from './migrate'

const directories: string[] = []

afterAll(() => {
  for (const directory of directories)
    rmSync(directory, { recursive: true, force: true })
})

function temporary() {
  const directory = mkdtempSync(join(tmpdir(), 'pagescms-migrate-test-'))
  directories.push(directory)
  return directory
}

function migrationFolder(
  entries: Array<{ tag: string; when: number; sql: string }>,
) {
  const folder = temporary()
  mkdirSync(join(folder, 'meta'))
  writeFileSync(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: entries.map(({ tag, when }, idx) => ({
        idx,
        version: '6',
        when,
        tag,
        breakpoints: true,
      })),
    }),
  )
  for (const { tag, sql } of entries)
    writeFileSync(join(folder, `${tag}.sql`), sql)
  return folder
}

function proofPlugin() {
  const migrations = migrationFolder([
    {
      tag: '0000_proof_items',
      when: 1,
      sql: 'CREATE TABLE `proof_items` (`id` text PRIMARY KEY NOT NULL);',
    },
  ])
  return definePlugin({
    id: 'proof-plugin',
    server: join(migrations, 'server.js'),
    migrations,
  })
}

async function tables(url: string) {
  const client = createClient({ url })
  try {
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    )
    return result.rows.map((row) => String(row.name))
  } finally {
    client.close()
  }
}

async function count(url: string, table: string) {
  const client = createClient({ url })
  try {
    const result = await client.execute(`SELECT count(*) AS n FROM "${table}"`)
    return Number(result.rows[0].n)
  } finally {
    client.close()
  }
}

const coreCount = readdirSync(new URL('../../drizzle', import.meta.url)).filter(
  (name) => name.endsWith('.sql'),
).length

describe('migration folders', () => {
  it('accepts the installed core migrations', () => {
    expect(() =>
      assertMigrationFolder(
        new URL('../../drizzle', import.meta.url).pathname,
        'core',
      ),
    ).not.toThrow()
  })

  it('rejects folders whose order or files diverge between migrators', () => {
    const outOfOrder = migrationFolder([
      { tag: '0000_a', when: 2, sql: 'SELECT 1;' },
      { tag: '0001_b', when: 1, sql: 'SELECT 1;' },
    ])
    expect(() => assertMigrationFolder(outOfOrder, 'x')).toThrow(/order/)
    const extra = migrationFolder([
      { tag: '0000_a', when: 1, sql: 'SELECT 1;' },
    ])
    writeFileSync(join(extra, '0001_b.sql'), 'SELECT 1;')
    expect(() => assertMigrationFolder(extra, 'x')).toThrow(/do not match/)
    expect(() => assertMigrationFolder(temporary(), 'x')).toThrow(/journal/)
  })

  it('uses separate journals per source and migrator', () => {
    expect(migrationJournal('core', 'node')).toBe('__drizzle_migrations')
    expect(migrationJournal('core', 'cloudflare')).toBe(
      '__pagescms_core_d1_migrations',
    )
    expect(migrationJournal('proof-plugin', 'node')).toBe(
      '__pagescms_proof_plugin_migrations',
    )
    expect(migrationJournal('proof-plugin', 'cloudflare')).toBe(
      '__pagescms_proof_plugin_d1_migrations',
    )
  })
})

describe('migratePackage on node', () => {
  it('does not replay the baseline over an already migrated database', async () => {
    const root = temporary()
    const environment = { DATABASE_URL: 'file:preview.db' }
    const client = createClient({
      url: pathToFileURL(join(root, 'preview.db')).href,
    })
    try {
      const source = new URL('../../drizzle/', import.meta.url)
      const journal = JSON.parse(
        readFileSync(new URL('meta/_journal.json', source), 'utf8'),
      ) as { entries: Array<{ tag: string; when: number }> }
      const entry = journal.entries[0]
      const baseline = migrationFolder([
        {
          ...entry,
          sql: readFileSync(new URL(`${entry.tag}.sql`, source), 'utf8'),
        },
      ])
      await migrate(drizzle(client), { migrationsFolder: baseline })
      await client.execute(
        "INSERT INTO user (id, name, email) VALUES ('existing', 'Existing', 'existing@example.com')",
      )
      await migratePackage({ target: 'node' }, { root, environment })
      await migratePackage({ target: 'node' }, { root, environment })
      expect(
        (await client.execute("SELECT email FROM user WHERE id = 'existing'"))
          .rows[0].email,
      ).toBe('existing@example.com')
    } finally {
      client.close()
    }
  })

  it('migrates core to both databases and plugins to the application database', async () => {
    const root = temporary()
    const config = defineConfig({ target: 'node', plugins: [proofPlugin()] })
    const environment = {
      DATABASE_URL: 'file:.data/application.db',
      CACHE_DATABASE_URL: 'file:.data/cache.db',
    }
    const steps = await migratePackage(config, { root, environment })
    expect(steps).toEqual([
      { database: 'DATABASE', source: 'core', journal: '__drizzle_migrations' },
      {
        database: 'DATABASE',
        source: 'proof-plugin',
        journal: '__pagescms_proof_plugin_migrations',
      },
      {
        database: 'CACHE_DATABASE',
        source: 'core',
        journal: '__drizzle_migrations',
      },
    ])
    const application = pathToFileURL(join(root, '.data/application.db')).href
    const cache = pathToFileURL(join(root, '.data/cache.db')).href
    expect(await tables(application)).toEqual(
      expect.arrayContaining(['user', 'proof_items']),
    )
    expect(await tables(cache)).toContain('user')
    expect(await tables(cache)).not.toContain('proof_items')
    expect(await tables(cache)).not.toContain(
      '__pagescms_proof_plugin_migrations',
    )

    // Idempotent: a second run applies nothing new.
    await migratePackage(config, { root, environment })
    expect(await count(application, '__drizzle_migrations')).toBe(coreCount)
    expect(await count(application, '__pagescms_proof_plugin_migrations')).toBe(
      1,
    )
    expect(await count(cache, '__drizzle_migrations')).toBe(coreCount)
  })

  it('migrates a shared cache database once', async () => {
    const root = temporary()
    const steps = await migratePackage(
      { target: 'node' },
      { root, environment: { DATABASE_URL: 'file:shared.db' } },
    )
    expect(steps.map(({ database }) => database)).toEqual(['DATABASE'])
  })

  it('requires an application database and valid plugin migrations', async () => {
    await expect(
      migratePackage(
        { target: 'node' },
        { root: temporary(), environment: {} },
      ),
    ).rejects.toThrow(/DATABASE_URL is required/)
    const plugin = definePlugin({
      id: 'broken',
      server: '/plugins/broken/server.js',
      migrations: temporary(),
    })
    const root = temporary()
    await expect(
      migratePackage(
        { target: 'node', plugins: [plugin] },
        { root, environment: { DATABASE_URL: 'file:app.db' } },
      ),
    ).rejects.toThrow(/broken migrations/)
    // Validation happens before any database is touched.
    expect(readdirSync(root)).toEqual([])
  })
})

describe('migratePackage on cloudflare (local D1)', () => {
  function project(bindings: object[]) {
    const root = temporary()
    writeFileSync(
      join(root, 'wrangler.jsonc'),
      `// local test project\n${JSON.stringify({
        name: 'pagescms-test',
        compatibility_date: '2026-08-20',
        d1_databases: bindings,
      })}`,
    )
    return root
  }

  // Reads through the project's own Wrangler config and the persistence path
  // used by the Vite plugin, as the local runtime would.
  async function localDatabases(root: string) {
    const proxy = await getPlatformProxy<Record<string, D1Database>>({
      configPath: join(root, 'wrangler.jsonc'),
      persist: { path: join(root, '.wrangler/state/v3') },
      remoteBindings: false,
    })
    try {
      const read = async (database: D1Database) => {
        const { results } = await database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all<{ name: string }>()
        const journal = async (table: string) =>
          results.some(({ name }) => name === table)
            ? await database
                .prepare(`SELECT count(*) AS n FROM "${table}"`)
                .first<number>('n')
            : 0
        return {
          tables: results.map(({ name }) => name),
          core: await journal('__pagescms_core_d1_migrations'),
          plugin: await journal('__pagescms_proof_plugin_d1_migrations'),
        }
      }
      return {
        application: await read(proxy.env.DATABASE),
        cache: await read(proxy.env.CACHE_DATABASE),
      }
    } finally {
      await proxy.dispose()
    }
  }

  it('applies core and plugin migrations with separate Wrangler journals', async () => {
    const root = project([
      {
        binding: 'DATABASE',
        database_name: 'application',
        database_id: '00000000-0000-4000-8000-000000000001',
      },
      {
        binding: 'CACHE_DATABASE',
        database_name: 'cache',
        database_id: '00000000-0000-4000-8000-000000000002',
        remote: true,
      },
    ])
    const config = defineConfig({
      target: 'cloudflare',
      plugins: [proofPlugin()],
    })
    const steps = await migratePackage(config, { root, environment: {} })
    expect(steps.map(({ database, source }) => [database, source])).toEqual([
      ['DATABASE', 'core'],
      ['DATABASE', 'proof-plugin'],
      ['CACHE_DATABASE', 'core'],
    ])
    await migratePackage(config, { root, environment: {} })

    const { application, cache } = await localDatabases(root)
    expect(application.tables).toEqual(
      expect.arrayContaining(['user', 'proof_items']),
    )
    expect(application).toMatchObject({ core: coreCount, plugin: 1 })
    expect(cache.tables).toContain('user')
    expect(cache.tables).not.toContain('proof_items')
    expect(cache).toMatchObject({ core: coreCount, plugin: 0 })
  }, 180_000)

  it('rejects missing bindings and conflicting core journals', async () => {
    await expect(
      migratePackage(
        { target: 'cloudflare' },
        {
          root: project([{ binding: 'CACHE_DATABASE', database_id: 'x' }]),
          environment: {},
        },
      ),
    ).rejects.toThrow(/DATABASE D1 binding is required/)
    await expect(
      migratePackage(
        { target: 'cloudflare' },
        {
          root: project([
            {
              binding: 'DATABASE',
              database_id: 'x',
              migrations_table: 'd1_migrations',
            },
          ]),
          environment: {},
        },
      ),
    ).rejects.toThrow(/migrations_table/)
    await expect(
      migratePackage({ target: 'cloudflare' }, { root: temporary() }),
    ).rejects.toThrow(/No Wrangler configuration/)
  }, 60_000)
})
