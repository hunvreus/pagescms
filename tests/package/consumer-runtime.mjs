import {
  configurationReference,
  configurationReferenceVersion,
} from 'pagescms/lib/configuration-reference'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createClient } from 'pagescms/libsql'

process.env.DATABASE_URL = 'file:./proof.db'
process.env.BETTER_AUTH_URL = 'http://localhost:3000'
process.env.BETTER_AUTH_SECRET = 'package-proof-local-only-secret-123456789'
process.env.PROOF_SECRET = 'RUNTIME_SECRET_SENTINEL'
const client = createClient({ url: process.env.DATABASE_URL })
assert.equal(
  (await client.execute('SELECT value FROM proof_plugin')).rows[0].value,
  'migration-ok',
)
const now = Date.now()
await client.execute({
  sql: 'INSERT INTO user (id,name,email,email_verified,created_at,updated_at,onboarding_completed_at) VALUES (?,?,?,?,?,?,?)',
  args: ['proof-user', 'Proof User', 'proof@example.test', 1, now, now, now],
})
await client.execute({
  sql: 'INSERT INTO session (id,token,user_id,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?)',
  args: ['proof-session', 'proof-token', 'proof-user', now + 3600000, now, now],
})
client.close()
const token = 'proof-token'
const signature = createHmac('sha256', process.env.BETTER_AUTH_SECRET)
  .update(token)
  .digest('base64')
const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`
const { default: app } = await import('./dist/server/server.js')
const request = (path, authenticated = false) =>
  app.fetch(
    new Request(`http://localhost:3000${path}`, {
      headers: authenticated ? { cookie } : {},
    }),
  )
let response = await request('/api/plugins/proof/health')
assert.equal(response.status, 200)
assert.deepEqual(await response.json(), {
  ok: true,
  configured: true,
  secret: true,
  read: 'HELLO',
  write: 'hello',
  valid: true,
})
response = await request('/api/plugins/proof/private')
assert.equal(response.status, 401)
response = await request('/api/plugins/proof/private', true)
assert.equal(response.status, 200)
assert.deepEqual(await response.json(), { user: 'proof-user' })
console.log(
  'PASS: installed core migrations, authenticated plugin endpoint, anonymous denial, and shared field round-trip',
)

process.exit(0)

assert.match(configurationReference, /# Pages CMS configuration reference/)
assert.equal(typeof configurationReferenceVersion, 'string')
