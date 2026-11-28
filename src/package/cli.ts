#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createServer, loadEnv, preview } from 'vite'
import { pagescms } from './vite'
import { loadPackageConfig } from './load'
import { copyCloudflareDeployConfig } from './deploy-config'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    help: { type: 'boolean', short: 'h' },
    port: { type: 'string' },
    host: { type: 'string' },
    mode: { type: 'string' },
    local: { type: 'boolean' },
    remote: { type: 'boolean' },
    'remote-libsql': { type: 'boolean' },
  },
})
const command = positionals[0] ?? 'dev'
if (values.help) {
  console.log(
    'Usage: pagescms [dev|build|start|preview|migrate] [--port 3000] [--host localhost] [--mode development|production] [--local|--remote] [--remote-libsql]\nUse migrate --local to require local SQLite or local D1. Cloudflare migrations are local unless --remote is specified. Use --remote-libsql when building a Node function for remote libSQL.',
  )
  process.exit(0)
}
if (
  positionals.length > 1 ||
  !['dev', 'build', 'start', 'preview', 'migrate'].includes(command)
)
  throw new Error('Unknown command. Run pagescms --help.')
if ((values.local || values.remote) && command !== 'migrate')
  throw new Error('--local and --remote are only valid with migrate')
if (values.local && values.remote)
  throw new Error('Choose either --local or --remote')
if (values['remote-libsql'] && command !== 'build')
  throw new Error('--remote-libsql is only valid with build')
const port = Number(values.port ?? 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('--port must be between 1 and 65535')
const host = values.host ?? 'localhost'
const mode =
  values.mode ??
  (['start', 'preview', 'build'].includes(command)
    ? 'production'
    : 'development')
function runtimeEnvironment() {
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), '')))
    process.env[key] ??= value
}
if (command === 'migrate') {
  const config = await loadPackageConfig(process.cwd())
  runtimeEnvironment()
  if (config.target === 'node' && values.local) {
    for (const key of ['DATABASE_URL', 'CACHE_DATABASE_URL']) {
      const url = process.env[key]?.trim()
      if (url && !url.startsWith('file:') && url !== ':memory:')
        throw new Error(
          `Local setup requires a SQLite file for ${key}. To migrate your configured database explicitly, run pagescms migrate.`,
        )
    }
  }
  if (config.target === 'cloudflare' && !values.remote)
    console.log('Migrating local Cloudflare databases only.')
  const { migratePackage } = await import('./migrate')
  for (const step of await migratePackage(config, { remote: values.remote }))
    console.log(`${step.database}: ${step.source} (${step.journal})`)
} else if (command === 'build') {
  const config = await loadPackageConfig(process.cwd())
  if (values['remote-libsql'] && config.target !== 'node')
    throw new Error('--remote-libsql requires the Node target')
  if (config.target === 'cloudflare') process.umask(process.umask() | 0o077)
  const { createBuilder } = await import('vite')
  const builder = await createBuilder({
    configFile: false,
    mode,
    plugins: await pagescms({ remoteLibsql: values['remote-libsql'] }),
  })
  if (config.target === 'node') {
    await builder.build(builder.environments.client)
    const { build } = await import('vite')
    await build({
      configFile: false,
      mode,
      plugins: await pagescms({ remoteLibsql: values['remote-libsql'] }),
      build: {
        ssr: fileURLToPath(import.meta.resolve('pagescms/server-entry')),
        outDir: resolve(process.cwd(), 'dist/server'),
        rollupOptions: { output: { entryFileNames: 'server.js' } },
      },
    })
  } else {
    await builder.buildApp()
    copyCloudflareDeployConfig(
      resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
      process.cwd(),
    )
  }
} else if (command === 'dev') {
  const plugins = await pagescms()
  runtimeEnvironment()
  const server = await createServer({
    configFile: false,
    mode,
    plugins,
    server: { port, host, strictPort: true },
  })
  await server.listen()
  server.printUrls()
} else {
  const config = await loadPackageConfig(process.cwd())
  runtimeEnvironment()
  if (config.target === 'node') {
    const { serveNode } = await import('./serve')
    await serveNode({ port, host })
  } else if (command === 'start') {
    throw new Error(
      'Cloudflare output runs with Wrangler or pagescms preview; start is for Node.',
    )
  } else {
    const server = await preview({
      configFile: false,
      mode,
      plugins: await pagescms(),
      preview: { port, host, strictPort: true },
    })
    server.printUrls()
  }
}
