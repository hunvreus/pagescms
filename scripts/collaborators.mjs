import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'

export const columns = [
  'type',
  'installationId',
  'ownerId',
  'repoId',
  'owner',
  'repo',
  'branch',
  'email',
  'userId',
  'invitedBy',
  'invitedByEmail',
]

export function stringifyCsv(rows) {
  const escape = (value) => {
    const text = String(value ?? '')
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return (
    [columns, ...rows.map((row) => columns.map((column) => row[column]))]
      .map((row) => row.map(escape).join(','))
      .join('\n') + '\n'
  )
}

export function parseCsv(input) {
  const rows = []
  let row = [],
    cell = '',
    quoted = false,
    closed = false
  const source = input.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        quoted = false
        closed = true
      } else cell += char
    } else if (char === '"') {
      if (cell || closed) throw new Error('Malformed CSV quoting')
      quoted = true
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell)
      cell = ''
      closed = false
      if (char !== ',') {
        if (row.some((value) => value.length)) rows.push(row)
        row = []
        if (char === '\r' && source[i + 1] === '\n') i++
      }
    } else {
      if (closed) throw new Error('Unexpected text after a quoted CSV cell')
      cell += char
    }
  }
  if (quoted) throw new Error('Unterminated CSV quote')
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  const headers = rows.shift()?.map((value) => value.trim()) ?? []
  if (new Set(headers).size !== headers.length)
    throw new Error('Duplicate CSV columns')
  for (const name of [
    'type',
    'installationId',
    'ownerId',
    'owner',
    'repo',
    'email',
  ]) {
    if (!headers.includes(name)) throw new Error(`Missing CSV column: ${name}`)
  }
  return rows.map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(`Wrong number of columns at CSV row ${index + 2}`)
    return Object.fromEntries(headers.map((name, i) => [name, values[i]]))
  })
}

export async function exportCollaborators(client) {
  const result =
    await client.execute(`SELECT c.type, c.installation_id AS installationId, c.owner_id AS ownerId, c.repo_id AS repoId,
    c.owner, c.repo, c.branch, c.email, c.user_id AS userId, c.invited_by AS invitedBy, u.email AS invitedByEmail
    FROM collaborator c LEFT JOIN user u ON u.id = c.invited_by ORDER BY c.owner, c.repo, c.email`)
  return stringifyCsv(result.rows)
}

export async function importCollaborators(client, csv, options = {}) {
  const rows = parseCsv(csv)
  if (!rows.length)
    throw new Error('CSV contains no collaborators; database was not changed')
  const users = (await client.execute('SELECT id, email FROM user')).rows
  const byId = (id) => users.find((user) => user.id === id)
  const byEmail = (email) =>
    users.find((user) => user.email.toLowerCase() === email?.toLowerCase())
  const fallback =
    byId(options.defaultInvitedByUserId) ??
    byEmail(options.defaultInvitedByEmail)
  if (
    (options.defaultInvitedByUserId || options.defaultInvitedByEmail) &&
    !fallback
  )
    throw new Error('Default inviter was not found')
  const statements = rows.map((row, index) => {
    const number = (name, optional = false) => {
      const value = row[name]?.trim()
      if (!value && optional) return null
      if (
        !value ||
        !/^\d+$/.test(value) ||
        !Number.isSafeInteger(Number(value))
      )
        throw new Error(`Invalid ${name} at CSV row ${index + 2}`)
      return Number(value)
    }
    for (const name of ['type', 'owner', 'repo', 'email']) {
      if (!row[name]?.trim())
        throw new Error(`Missing ${name} at CSV row ${index + 2}`)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim()))
      throw new Error(`Invalid email at CSV row ${index + 2}`)
    const linked = byEmail(row.email.trim()) ?? byId(row.userId?.trim())
    const inviter =
      byEmail(row.invitedByEmail?.trim()) ??
      byId(row.invitedBy?.trim()) ??
      fallback
    return {
      sql: `INSERT INTO collaborator (type, installation_id, owner_id, repo_id, owner, repo, branch, email, user_id, invited_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (lower(owner), lower(repo), lower(email)) DO UPDATE SET
        type=excluded.type, installation_id=excluded.installation_id, owner_id=excluded.owner_id, repo_id=excluded.repo_id,
        owner=excluded.owner, repo=excluded.repo, branch=excluded.branch, email=excluded.email, user_id=excluded.user_id, invited_by=excluded.invited_by`,
      args: [
        row.type.trim(),
        number('installationId'),
        number('ownerId'),
        number('repoId', true),
        row.owner.trim(),
        row.repo.trim(),
        row.branch?.trim() || null,
        row.email.trim().toLowerCase(),
        linked?.id ?? null,
        inviter?.id ?? null,
      ],
    }
  })
  // Validate every row before replacing anything; the entire write is atomic.
  await client.batch(
    [
      ...(options.replace
        ? [{ sql: 'DELETE FROM collaborator', args: [] }]
        : []),
      ...statements,
    ],
    'write',
  )
  return rows.length
}

async function main() {
  const argument = (name) =>
    process.argv
      .find((value) => value.startsWith(`--${name}=`))
      ?.slice(name.length + 3)
  const operation = process.argv[2]
  if (!['export', 'import'].includes(operation))
    throw new Error('Expected export or import')
  const url =
    argument('url') ?? process.env.DATABASE_URL ?? process.env.SQLITE_URL
  if (!url) throw new Error('DATABASE_URL or --url is required')
  const client = createClient({
    url,
    authToken:
      process.env.DATABASE_AUTH_TOKEN ||
      process.env.SQLITE_AUTH_TOKEN ||
      undefined,
  })
  try {
    if (operation === 'export') {
      const output = resolve(
        argument('output') ?? argument('out') ?? 'collaborators-export.csv',
      )
      await writeFile(output, await exportCollaborators(client), {
        encoding: 'utf8',
        flag: 'wx',
      })
      console.log(`Exported collaborators to ${output}`)
    } else {
      const input = argument('input')
      if (!input) throw new Error('--input=<path> is required')
      const count = await importCollaborators(
        client,
        await readFile(resolve(input), 'utf8'),
        {
          replace: process.argv.includes('--replace'),
          defaultInvitedByUserId: argument('default-invited-by-user-id'),
          defaultInvitedByEmail: argument('default-invited-by-email'),
        },
      )
      console.log(`Imported ${count} collaborators`)
    }
  } finally {
    client.close()
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
