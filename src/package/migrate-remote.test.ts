import { EventEmitter } from 'node:events'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type * as ChildProcess from 'node:child_process'
import { definePlugin } from './config'
import { migratePackage } from './migrate'

const calls = vi.hoisted(
  () => [] as Array<{ args: string[]; config: any; stdio: unknown }>,
)

vi.mock('node:child_process', async (load) => ({
  ...(await load<typeof ChildProcess>()),
  spawn: (_bin: string, args: string[], options: { stdio: unknown }) => {
    const config = JSON.parse(
      readFileSync(args[args.indexOf('--config') + 1], 'utf8'),
    )
    calls.push({ args, config, stdio: options.stdio })
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('exit', 0))
    return child
  },
}))

const roots: string[] = []
afterEach(() => {
  calls.length = 0
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function project(shared = false) {
  const root = mkdtempSync(join(tmpdir(), 'pagescms-remote-migrate-'))
  roots.push(root)
  const folder = join(root, 'plugin')
  mkdirSync(join(folder, 'meta'), { recursive: true })
  writeFileSync(
    join(folder, '0000_plugin.sql'),
    'CREATE TABLE plugin_items (id TEXT);',
  )
  writeFileSync(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({ entries: [{ idx: 0, when: 1, tag: '0000_plugin' }] }),
  )
  writeFileSync(
    join(root, 'wrangler.jsonc'),
    JSON.stringify({
      name: 'test',
      account_id: '12345678901234567890123456789012',
      compatibility_date: '2026-08-20',
      d1_databases: [
        {
          binding: 'DATABASE',
          database_name: 'app',
          database_id: '00000000-0000-4000-8000-000000000001',
          preview_database_id: '00000000-0000-4000-8000-000000000003',
        },
        {
          binding: 'CACHE_DATABASE',
          database_name: 'cache',
          database_id: shared
            ? '00000000-0000-4000-8000-000000000001'
            : '00000000-0000-4000-8000-000000000002',
          preview_database_id: '00000000-0000-4000-8000-000000000004',
        },
      ],
    }),
  )
  const plugin = definePlugin({
    id: 'proof-plugin',
    server: join(root, 'server.js'),
    migrations: folder,
  })
  return { root, plugin }
}

it('applies remote core and plugin journals, including a separate cache', async () => {
  const { root, plugin } = project()
  const steps = await migratePackage(
    { target: 'cloudflare', plugins: [plugin] },
    { root, environment: {}, remote: true },
  )
  expect(steps.map(({ database, source }) => [database, source])).toEqual([
    ['DATABASE', 'core'],
    ['DATABASE', 'proof-plugin'],
    ['CACHE_DATABASE', 'core'],
  ])
  expect(calls).toHaveLength(3)
  for (const call of calls) {
    expect(call.args).toContain('--remote')
    expect(call.args).not.toContain('--local')
    expect(call.args).not.toContain('--persist-to')
    expect(call.stdio).toEqual(['inherit', 'inherit', 'inherit'])
    expect(call.config.account_id).toBe('12345678901234567890123456789012')
  }
  expect(
    calls.map(({ config }) => config.d1_databases[0].migrations_table),
  ).toEqual([
    '__pagescms_core_d1_migrations',
    '__pagescms_proof_plugin_d1_migrations',
    '__pagescms_core_d1_migrations',
  ])
  expect(calls[1].config.d1_databases[0].migrations_dir).toBe(
    join(root, 'plugin'),
  )
})

it('uses the selected Cloudflare environment for remote bindings', async () => {
  const { root } = project()
  const path = join(root, 'wrangler.jsonc')
  const config = JSON.parse(readFileSync(path, 'utf8'))
  config.env = {
    staging: {
      d1_databases: [
        {
          binding: 'DATABASE',
          database_name: 'staging',
          database_id: '00000000-0000-4000-8000-000000000005',
        },
      ],
    },
  }
  writeFileSync(path, JSON.stringify(config))
  await migratePackage(
    { target: 'cloudflare' },
    { root, environment: { CLOUDFLARE_ENV: 'staging' }, remote: true },
  )
  expect(calls).toHaveLength(1)
  expect(calls[0].config.d1_databases[0].database_id).toBe(
    '00000000-0000-4000-8000-000000000005',
  )
})

it('uses an explicit Wrangler config path for migrations', async () => {
  const { root } = project()
  const original = join(root, 'wrangler.jsonc')
  const alternate = join(root, 'production.json')
  const config = JSON.parse(readFileSync(original, 'utf8'))
  config.d1_databases = [
    {
      binding: 'DATABASE',
      database_name: 'selected',
      database_id: '00000000-0000-4000-8000-000000000006',
    },
  ]
  writeFileSync(alternate, JSON.stringify(config))
  await migratePackage(
    { target: 'cloudflare' },
    {
      root,
      environment: { CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH: 'production.json' },
      remote: true,
    },
  )
  expect(calls[0].config.d1_databases[0].database_id).toBe(
    '00000000-0000-4000-8000-000000000006',
  )
})

it('deduplicates remote databases by production ID, not preview ID', async () => {
  const { root, plugin } = project(true)
  const steps = await migratePackage(
    { target: 'cloudflare', plugins: [plugin] },
    { root, environment: {}, remote: true },
  )
  expect(steps.map(({ source }) => source)).toEqual(['core', 'proof-plugin'])
})

it('rejects remote mode for Node and missing remote database IDs', async () => {
  await expect(
    migratePackage({ target: 'node' }, { remote: true }),
  ).rejects.toThrow(/only available for Cloudflare/)
  const { root } = project()
  const path = join(root, 'wrangler.jsonc')
  const config = JSON.parse(readFileSync(path, 'utf8'))
  delete config.d1_databases[1].database_id
  writeFileSync(path, JSON.stringify(config))
  await expect(
    migratePackage(
      { target: 'cloudflare' },
      { root, environment: {}, remote: true },
    ),
  ).rejects.toThrow(/CACHE_DATABASE database_id/)
  expect(calls).toHaveLength(0)
})
