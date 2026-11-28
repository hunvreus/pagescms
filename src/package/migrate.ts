import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PackageConfigurationError, defineConfig } from './config'
import type { PackageConfig, PackageConfigInput } from './config'

// Explicit command only: builds and the runtime never apply migrations.

// Same depth from src/package and dist/package.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const coreMigrations = resolve(packageRoot, 'drizzle')

const CORE_LIBSQL_JOURNAL = '__drizzle_migrations'
const CORE_D1_JOURNAL = '__pagescms_core_d1_migrations'
const WRANGLER_CONFIGS = ['wrangler.jsonc', 'wrangler.json', 'wrangler.toml']

type Database = 'DATABASE' | 'CACHE_DATABASE'
type Environment = Record<string, string | undefined>

export interface MigratePackageOptions {
  /** Application root; default `process.cwd()`. */
  root?: string
  /** Variables; default `process.env`. */
  environment?: Environment
  /** Apply Cloudflare D1 migrations remotely instead of in local storage. */
  remote?: boolean
}

export interface MigrationStep {
  database: Database
  /** `core` or the plugin ID. */
  source: string
  journal: string
}

interface Source {
  id: string
  folder: string
}

export function migrationJournal(
  source: string,
  target: PackageConfig['target'],
) {
  if (source === 'core')
    return target === 'node' ? CORE_LIBSQL_JOURNAL : CORE_D1_JOURNAL
  const name = source.replaceAll('-', '_')
  return target === 'node'
    ? `__pagescms_${name}_migrations`
    : `__pagescms_${name}_d1_migrations`
}

/**
 * Both migrators must apply the same files in the same order: drizzle follows
 * the journal and skips entries older than the last applied `when`; Wrangler
 * sorts `*.sql` by leading number.
 */
export function assertMigrationFolder(folder: string, label: string) {
  const fail = (reason: string): never => {
    throw new PackageConfigurationError(`${label} migrations: ${reason}`)
  }
  let journal: unknown
  try {
    journal = JSON.parse(
      readFileSync(join(folder, 'meta/_journal.json'), 'utf8'),
    )
  } catch {
    fail(`missing or invalid meta/_journal.json in ${folder}`)
  }
  const entries = (journal as { entries?: unknown }).entries
  if (!Array.isArray(entries)) return fail('journal has no entries')
  const tags: string[] = []
  let previous = { idx: -1, number: -1, when: -1 }
  for (const entry of entries as Array<Record<string, unknown>>) {
    const { idx, tag, when } = entry
    const match = typeof tag === 'string' ? /^(\d+)_/.exec(tag) : null
    if (
      typeof idx !== 'number' ||
      typeof when !== 'number' ||
      !match ||
      !(idx > previous.idx) ||
      !(Number(match[1]) > previous.number) ||
      !(when > previous.when)
    )
      fail(`journal entry ${String(tag)} is out of order`)
    previous = {
      idx: idx as number,
      number: Number(match![1]),
      when: when as number,
    }
    tags.push(`${tag as string}.sql`)
  }
  const files = readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort()
  if (JSON.stringify(files) !== JSON.stringify([...tags].sort()))
    fail('SQL files do not match meta/_journal.json')
}

function sources(config: PackageConfig) {
  const core: Source = { id: 'core', folder: coreMigrations }
  const plugins = config.plugins.flatMap((plugin) =>
    plugin.migrations ? [{ id: plugin.id, folder: plugin.migrations }] : [],
  )
  for (const source of [core, ...plugins])
    assertMigrationFolder(source.folder, source.id)
  return { core, plugins }
}

function optional(value: string | undefined) {
  return value?.trim() || undefined
}

// Relative `file:` URLs resolve against the application root, not the shell.
function libsqlUrl(url: string, root: string) {
  if (!url.startsWith('file:') || url.startsWith('file://')) return url
  const path = url.slice('file:'.length)
  return path === ':memory:' ? url : pathToFileURL(resolve(root, path)).href
}

async function migrateNode(
  config: PackageConfig,
  root: string,
  environment: Environment,
) {
  const url = optional(environment.DATABASE_URL)
  if (!url) throw new Error('DATABASE_URL is required')
  const application = {
    url: libsqlUrl(url, root),
    authToken: optional(environment.DATABASE_AUTH_TOKEN),
  }
  const cacheUrl = optional(environment.CACHE_DATABASE_URL)
  const cache = {
    url: cacheUrl ? libsqlUrl(cacheUrl, root) : application.url,
    authToken:
      optional(environment.CACHE_DATABASE_AUTH_TOKEN) ?? application.authToken,
  }
  const shared =
    cache.url === application.url && cache.authToken === application.authToken
  const { core, plugins } = sources(config)
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  const steps: MigrationStep[] = []

  async function run(
    target: typeof application,
    database: Database,
    list: Source[],
  ) {
    if (target.url.startsWith('file://'))
      await mkdir(dirname(fileURLToPath(target.url)), { recursive: true })
    const client = createClient(target)
    try {
      for (const source of list) {
        const journal = migrationJournal(source.id, 'node')
        await migrate(drizzle(client), {
          migrationsFolder: source.folder,
          migrationsTable: journal,
        })
        steps.push({ database, source: source.id, journal })
      }
    } finally {
      client.close()
    }
  }

  await run(application, 'DATABASE', [core, ...plugins])
  if (!shared) await run(cache, 'CACHE_DATABASE', [core])
  return steps
}

interface D1Binding {
  binding: string
  database_name?: string
  database_id?: string
  preview_database_id?: string
  migrations_table?: string
}

interface WranglerModule {
  unstable_readConfig: (
    args: { config: string; env?: string },
    options?: { hideWarnings?: boolean },
  ) => {
    account_id?: string
    compatibility_date?: string
    d1_databases: D1Binding[]
  }
}

function resolveWrangler(root: string) {
  for (const base of [join(root, 'package.json'), import.meta.url]) {
    try {
      const require = createRequire(base)
      const manifest = require.resolve('wrangler/package.json')
      const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as {
        bin: Record<string, string>
      }
      return {
        module: require.resolve('wrangler'),
        bin: join(dirname(manifest), bin.wrangler),
      }
    } catch {
      // Try the next location.
    }
  }
  throw new Error('Install wrangler to migrate a Cloudflare application')
}

// Local D1 storage is keyed like Wrangler and the Vite plugin do.
function localId(binding: D1Binding) {
  return binding.preview_database_id ?? binding.database_id ?? binding.binding
}

function runWrangler(
  bin: string,
  args: string[],
  cwd: string,
  remote: boolean,
) {
  return new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd,
      stdio: [remote ? 'inherit' : 'ignore', 'inherit', 'inherit'],
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0
        ? done()
        : reject(new Error(`wrangler ${args.slice(0, 3).join(' ')} failed`)),
    )
  })
}

async function migrateCloudflare(
  config: PackageConfig,
  root: string,
  environment: Environment,
  remote: boolean,
) {
  const explicitConfig = optional(
    environment.CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH,
  )
  const configPath = explicitConfig
    ? resolve(root, explicitConfig)
    : WRANGLER_CONFIGS.map((name) => join(root, name)).find((path) =>
        existsSync(path),
      )
  if (!configPath) throw new Error(`No Wrangler configuration in ${root}`)
  const { core, plugins } = sources(config)
  const wrangler = resolveWrangler(root)
  const imported = (await import(pathToFileURL(wrangler.module).href)) as
    WranglerModule | { default: WranglerModule }
  const { unstable_readConfig } =
    'unstable_readConfig' in imported ? imported : imported.default
  const wranglerConfig = unstable_readConfig(
    { config: configPath, env: optional(environment.CLOUDFLARE_ENV) },
    { hideWarnings: true },
  )
  const find = (name: Database) =>
    wranglerConfig.d1_databases.find(({ binding }) => binding === name)
  const application = find('DATABASE')
  const cache = find('CACHE_DATABASE')
  if (!application) throw new Error('DATABASE D1 binding is required')
  if (remote)
    for (const binding of [application, cache])
      if (binding && !binding.database_id)
        throw new Error(
          `${binding.binding} database_id is required for remote migrations`,
        )
  for (const binding of [application, cache])
    if (
      binding?.migrations_table &&
      binding.migrations_table !== CORE_D1_JOURNAL
    )
      throw new Error(
        `${binding.binding} migrations_table must be ${CORE_D1_JOURNAL} or unset`,
      )

  const persistTo = join(root, '.wrangler/state')
  const directory = await mkdtemp(join(tmpdir(), 'pagescms-migrate-'))
  const steps: MigrationStep[] = []
  try {
    const run = async (binding: D1Binding, source: Source) => {
      const journal = migrationJournal(source.id, 'cloudflare')
      const path = join(directory, `${binding.binding}-${source.id}.json`)
      await writeFile(
        path,
        JSON.stringify({
          name: 'pagescms-migrations',
          account_id: wranglerConfig.account_id,
          compatibility_date: wranglerConfig.compatibility_date,
          d1_databases: [
            {
              binding: binding.binding,
              database_name: binding.database_name,
              database_id: binding.database_id,
              preview_database_id: binding.preview_database_id,
              migrations_dir: source.folder,
              migrations_table: journal,
            },
          ],
        }),
      )
      await runWrangler(
        wrangler.bin,
        [
          'd1',
          'migrations',
          'apply',
          binding.binding,
          remote ? '--remote' : '--local',
          '--config',
          path,
          ...(!remote ? ['--persist-to', persistTo] : []),
        ],
        root,
        remote,
      )
      steps.push({
        database: binding.binding as Database,
        source: source.id,
        journal,
      })
    }
    for (const source of [core, ...plugins]) await run(application, source)
    if (
      cache &&
      (remote
        ? cache.database_id !== application.database_id
        : localId(cache) !== localId(application))
    )
      await run(cache, core)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
  return steps
}

/**
 * Applies core migrations to the application and (when distinct) cache
 * database, then plugin migrations to the application database. Cloudflare
 * targets use local D1 storage unless remote is explicitly requested.
 */
export async function migratePackage(
  input: PackageConfigInput | PackageConfig,
  options: MigratePackageOptions = {},
): Promise<MigrationStep[]> {
  const config = defineConfig(input)
  const root = resolve(options.root ?? process.cwd())
  const environment = options.environment ?? process.env
  if (options.remote && config.target !== 'cloudflare')
    throw new Error(
      'Remote migrations are only available for Cloudflare targets',
    )
  return config.target === 'node'
    ? migrateNode(config, root, environment)
    : migrateCloudflare(config, root, environment, options.remote === true)
}
