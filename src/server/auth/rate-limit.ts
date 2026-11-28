import { executeAtomic } from '#/server/db/core'
import type { Database } from '#/server/db/client'
import { APIError } from 'better-auth/api'

const WINDOW_MS = 10 * 60_000
const MAX_SENDS = 3

/** Shared across processes; IP rotation cannot bypass the recipient limit. */
export async function consumeLoginEmail(
  database: Database,
  email: string,
  secret: string,
  now = Date.now(),
) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`auth-email-rate\0${email.trim().toLowerCase()}`),
  )
  const recipient = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  const [result] = await executeAtomic(database, [
    {
      sql: `INSERT INTO auth_email_rate(key,count,started_at) VALUES(?,1,?)
      ON CONFLICT(key) DO UPDATE SET
        count=CASE WHEN started_at<=? THEN 1 ELSE count+1 END,
        started_at=CASE WHEN started_at<=? THEN excluded.started_at ELSE started_at END
      WHERE started_at<=? OR count<?
      RETURNING count`,
      args: [
        recipient,
        now,
        now - WINDOW_MS,
        now - WINDOW_MS,
        now - WINDOW_MS,
        MAX_SENDS,
      ],
    },
    {
      sql: 'DELETE FROM auth_email_rate WHERE started_at<?',
      args: [now - WINDOW_MS],
    },
  ])
  if (!result.rows.length)
    throw new APIError('TOO_MANY_REQUESTS', {
      message: 'Too many sign-in emails; try again later',
    })
}
