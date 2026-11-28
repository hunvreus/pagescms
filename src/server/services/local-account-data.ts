import { all } from '#/server/db/sql'
import type { Database } from '#/server/db/client'
import type { userTable } from '#/server/db/schema'

const encoder = new TextEncoder()
const scope = 'pagescms:local-account-data:v1:'

function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function decode(value: string) {
  return Uint8Array.from(
    atob(value.replaceAll('-', '+').replaceAll('_', '/')),
    (character) => character.charCodeAt(0),
  )
}

async function key(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

// This receipt proves only that this browser once owned local data for an
// account. It grants no session/access and cannot enumerate arbitrary users.
export async function localAccountReceipt(account: string, secret: string) {
  const payload = encode(encoder.encode(account))
  const signature = await crypto.subtle.sign(
    'HMAC',
    await key(secret),
    encoder.encode(scope + payload),
  )
  return `${payload}.${encode(new Uint8Array(signature))}`
}

export async function receiptAccount(receipt: string, secret: string) {
  try {
    const parts = receipt.split('.')
    if (parts.length !== 2) return
    const [payload, signature] = parts
    if (!payload || !signature) return
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await key(secret),
        decode(signature),
        encoder.encode(scope + payload),
      ))
    )
      return
    const account = new TextDecoder().decode(decode(payload))
    return account && account.length <= 256 ? account : undefined
  } catch {
    return undefined
  }
}

export async function deletedLocalAccounts(
  database: Database,
  secret: string,
  receipts: string[],
) {
  const accounts = [
    ...new Set(
      (
        await Promise.all(
          receipts.map((receipt) => receiptAccount(receipt, secret)),
        )
      ).filter((value): value is string => Boolean(value)),
    ),
  ]
  if (!accounts.length) return []
  const existing = new Set(
    (
      await all<Pick<typeof userTable.$inferSelect, 'id'>>(
        database,
        `SELECT id FROM user WHERE id IN (${accounts.map(() => '?').join(', ')})`,
        accounts,
      )
    ).map((user) => user.id),
  )
  return accounts.filter((account) => !existing.has(account))
}
