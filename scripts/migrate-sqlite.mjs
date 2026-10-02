import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function localCacheUrl(url) {
  if (!url.startsWith('file:')) return url
  if (url === 'file::memory:') return url
  return url.endsWith('.db') ? `${url.slice(0, -3)}-cache.db` : `${url}-cache`
}

async function ensureLocalDirectory(url) {
  if (!url.startsWith('file:')) return
  const value = url.slice('file:'.length)
  const path = value.startsWith('//') ? fileURLToPath(url) : resolve(value)
  await mkdir(dirname(path), { recursive: true })
}

const application = {
  url: required('DATABASE_URL'),
  authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined,
}
const cache = {
  url: process.env.CACHE_DATABASE_URL?.trim() || localCacheUrl(application.url),
  authToken:
    process.env.CACHE_DATABASE_AUTH_TOKEN?.trim() || application.authToken,
}
const targets = new Map(
  [application, cache].map((target) => [
    JSON.stringify([target.url, target.authToken ?? '']),
    target,
  ]),
)

for (const target of targets.values()) {
  await ensureLocalDirectory(target.url)
  const client = createClient(target)
  try {
    await migrate(drizzle(client), { migrationsFolder: './drizzle' })
  } finally {
    client.close()
  }
}
