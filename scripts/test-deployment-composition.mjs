import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = 'tests/deployment/fake-pro/server.server.ts'
const clientEntry = 'tests/deployment/fake-pro/client.tsx'
const clientSentinel = 'PAGESCMS_FAKE_CLIENT_DEPLOYMENT'
const serverSentinel = 'PAGESCMS_SERVER_ONLY_SENTINEL'
const javascriptExtensions = new Set(['.cjs', '.js', '.mjs'])

function environmentWithoutSelection() {
  const environment = { ...process.env }
  delete environment.PAGESCMS_DEPLOYMENT_SERVER
  delete environment.PAGESCMS_DEPLOYMENT_CLIENT
  return environment
}

function build(environment) {
  const result = spawnSync('pnpm', ['build'], {
    cwd: rootDirectory,
    env: environment,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Deployment composition build exited with ${result.status}`)
  }
}

function javascriptFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) files.push(...javascriptFiles(path))
    else if (javascriptExtensions.has(extname(path))) files.push(path)
  }
  return files
}

function contains(directory, sentinel) {
  return javascriptFiles(directory).some((path) =>
    readFileSync(path, 'utf8').includes(sentinel),
  )
}

function assertPresence(directory, sentinel, expected) {
  const present = contains(join(rootDirectory, directory), sentinel)
  if (present !== expected) {
    throw new Error(
      `${expected ? 'Expected' : 'Unexpected'} deployment sentinel ` +
        `'${sentinel}' in ${directory}`,
    )
  }
}

const publicEnvironment = environmentWithoutSelection()
let failure

try {
  build(publicEnvironment)
  assertPresence('dist', clientSentinel, false)
  assertPresence('dist', serverSentinel, false)

  build({
    ...publicEnvironment,
    PAGESCMS_DEPLOYMENT_SERVER: serverEntry,
    PAGESCMS_DEPLOYMENT_CLIENT: clientEntry,
  })
  assertPresence('dist/client', clientSentinel, true)
  assertPresence('dist/client', serverSentinel, false)
  assertPresence('dist/server', serverSentinel, true)
} catch (error) {
  failure = error
} finally {
  try {
    // Always leave the normal public artifact behind, including after failure.
    build(publicEnvironment)
  } catch (restoreError) {
    failure = failure
      ? new AggregateError(
          [failure, restoreError],
          'Composition validation and public artifact restoration failed',
        )
      : restoreError
  }
}

if (failure) throw failure
