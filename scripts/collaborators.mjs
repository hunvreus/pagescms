#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export const columns = [
  'type',
  'installationId',
  'ownerId',
  'repoId',
  'owner',
  'repo',
  'branch',
  'email',
  'name',
  'userId',
  'invitedBy',
  'invitedByEmail',
  'createdAt',
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
  if (headers.some((name) => !columns.includes(name)))
    throw new Error('Unexpected collaborator CSV column')
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
    c.owner, c.repo, c.email, c.name, c.user_id AS userId, c.invited_by AS invitedBy, u.email AS invitedByEmail, c.created_at AS createdAt
    FROM collaborator c LEFT JOIN user u ON u.id = c.invited_by
    WHERE c.pending = 0 ORDER BY c.owner, c.repo, c.email`)
  return stringifyCsv(result.rows)
}

export function collaboratorImportStatements(csv, users = [], options = {}) {
  const rows = parseCsv(csv)
  if (!rows.length)
    throw new Error('CSV contains no collaborators; database was not changed')
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
    if (row.branch?.trim())
      throw new Error(
        `Branch-scoped membership at CSV row ${index + 2} needs an explicit permissions migration; refusing to widen access.`,
      )
    const linked = byEmail(row.email.trim())
    const inviter = byEmail(row.invitedByEmail?.trim()) ?? fallback
    return {
      sql: `INSERT INTO collaborator (type, installation_id, owner_id, repo_id, owner, repo, email, name, user_id, invited_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (repo_id, lower(email)) DO UPDATE SET
        type=excluded.type, installation_id=excluded.installation_id, owner_id=excluded.owner_id, repo_id=excluded.repo_id,
        owner=excluded.owner, repo=excluded.repo, email=excluded.email, name=excluded.name, user_id=excluded.user_id, invited_by=excluded.invited_by,
        created_at=coalesce(collaborator.created_at, excluded.created_at)`,
      args: [
        row.type.trim(),
        number('installationId'),
        number('ownerId'),
        number('repoId'),
        row.owner.trim(),
        row.repo.trim(),
        row.email.trim().toLowerCase(),
        row.name?.trim() || null,
        linked?.id ?? null,
        inviter?.id ?? null,
        number('createdAt', true),
      ],
    }
  })
  return statements
}

export async function importCollaborators(client, csv, options = {}) {
  const users = (
    await client.execute('SELECT id, email FROM user WHERE email_verified = 1')
  ).rows
  const statements = collaboratorImportStatements(csv, users, options)
  // Validate every row before replacing anything; the entire write is atomic.
  await client.batch(
    [
      ...(options.replace
        ? [
            {
              sql: `DELETE FROM collaborator_invite WHERE EXISTS (
                SELECT 1 FROM collaborator WHERE lower(collaborator.owner) = lower(collaborator_invite.owner)
                AND lower(collaborator.repo) = lower(collaborator_invite.repo)
                AND lower(collaborator.email) = lower(collaborator_invite.email))`,
              args: [],
            },
            {
              sql: 'DELETE FROM collaborator',
              args: [],
            },
          ]
        : []),
      ...statements,
    ],
    'write',
  )
  return statements.length
}

export const postgresExportQuery = `COPY (
  SELECT c.type, c.installation_id AS "installationId", c.owner_id AS "ownerId", c.repo_id AS "repoId",
    c.owner, c.repo, c.branch, c.email, member.name,
    c.user_id AS "userId", c.invited_by AS "invitedBy", inviter.email AS "invitedByEmail",
    NULL::bigint AS "createdAt"
  FROM collaborator c
  LEFT JOIN "user" member ON member.id = c.user_id
  LEFT JOIN "user" inviter ON inviter.id = c.invited_by
  ORDER BY c.owner, c.repo, c.email
) TO STDOUT WITH (FORMAT CSV, HEADER TRUE)`

export async function exportPostgresCollaborators(url) {
  // libpq treats PGDATABASE as a database name, even when it contains a URI.
  const source = new URL(url)
  const connection = {}
  if (source.hostname)
    connection.PGHOST = source.hostname.replace(/^\[|\]$/g, '')
  if (source.port) connection.PGPORT = source.port
  if (source.username) connection.PGUSER = decodeURIComponent(source.username)
  if (source.password)
    connection.PGPASSWORD = decodeURIComponent(source.password)
  if (source.pathname.length > 1)
    connection.PGDATABASE = decodeURIComponent(source.pathname.slice(1))
  const options = {
    host: 'PGHOST',
    port: 'PGPORT',
    user: 'PGUSER',
    password: 'PGPASSWORD',
    dbname: 'PGDATABASE',
    sslmode: 'PGSSLMODE',
    sslrootcert: 'PGSSLROOTCERT',
    sslcert: 'PGSSLCERT',
    sslkey: 'PGSSLKEY',
    connect_timeout: 'PGCONNECT_TIMEOUT',
    channel_binding: 'PGCHANNELBINDING',
    application_name: 'PGAPPNAME',
  }
  for (const [name, value] of source.searchParams) {
    if (!Object.hasOwn(options, name))
      throw new Error(
        'Unsupported PostgreSQL URL option. Set the corresponding libpq environment variable instead.',
      )
    connection[options[name]] = value
  }
  const { stdout } = await promisify(execFile)(
    'psql',
    [
      '-X',
      '--no-password',
      '--set=ON_ERROR_STOP=1',
      '--quiet',
      '--command',
      postgresExportQuery,
    ],
    {
      env: {
        ...process.env,
        ...connection,
        PGOPTIONS: '-c default_transaction_read_only=on',
      },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60_000,
    },
  ).catch((error) => {
    if (error.code === 'ENOENT')
      throw new Error(
        'Install PostgreSQL client tools (psql) to export this source.',
      )
    // PostgreSQL diagnostics may contain the source connection string.
    throw new Error(
      'PostgreSQL export failed. Check the source URL, read permission and retained v2 schema.',
    )
  })
  return stringifyCsv(parseCsv(stdout))
}

function sqlLiteral(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (value.includes('\0'))
    throw new Error('NUL characters are not supported in collaborator exports')
  return `'${value.replaceAll("'", "''")}'`
}

export function collaboratorsSql(csv) {
  const rows = parseCsv(csv)
  const statements = collaboratorImportStatements(csv)
  return (
    '-- Collaborator assignments only. Apply core migrations first.\n' +
    statements
      .map((statement, index) => {
        let position = 0
        return (
          statement.sql.replace(/\?/g, () => {
            const at = position++
            if (at === 8 || at === 9) {
              const email =
                at === 8
                  ? rows[index].email.trim().toLowerCase()
                  : rows[index].invitedByEmail?.trim().toLowerCase()
              return email
                ? `(SELECT id FROM user WHERE email_verified = 1 AND lower(email) = ${sqlLiteral(email)})`
                : 'NULL'
            }
            return sqlLiteral(statement.args[at])
          }) + ';'
        )
      })
      .join('\n') +
    '\n'
  )
}

async function main() {
  const envFile = resolve('.env.local')
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const argument = (name) =>
    process.argv
      .find((value) => value.startsWith(`--${name}=`))
      ?.slice(name.length + 3)
  const operation = process.argv[2]
  if (operation === 'migrate-2x') {
    const source = process.env.COLLABORATORS_SOURCE_URL
    const output = argument('output')
    const url = process.env.DATABASE_URL
    if (!source || !/^postgres(?:ql)?:/.test(source))
      throw new Error('COLLABORATORS_SOURCE_URL must be a PostgreSQL URL')
    if (!output && !url)
      throw new Error('Set DATABASE_URL or pass --output=<D1 SQL path>')
    const csv = await exportPostgresCollaborators(source)
    if (!parseCsv(csv).length) {
      console.log('No collaborator assignments to migrate')
      return
    }
    if (output) {
      await writeFile(resolve(output), collaboratorsSql(csv), {
        flag: 'wx',
        mode: 0o600,
      })
      console.log('Prepared collaborator SQL for D1')
      return
    }
    const client = createClient({
      url,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    })
    try {
      console.log(
        `Migrated ${await importCollaborators(client, csv)} collaborator assignments`,
      )
    } finally {
      client.close()
    }
    return
  }
  if (!['export', 'import', 'sql'].includes(operation))
    throw new Error('Expected migrate-2x, export, import or sql')
  if (operation === 'sql') {
    const input = argument('input')
    if (!input) throw new Error('--input=<CSV path> is required')
    const output = resolve(argument('output') ?? 'collaborators-import.sql')
    const sql = collaboratorsSql(await readFile(resolve(input), 'utf8'))
    await writeFile(output, sql, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    console.log(
      `Prepared ${parseCsv(await readFile(resolve(input), 'utf8')).length} assignments in ${output}; no database changed`,
    )
    return
  }
  const url =
    argument('url') ??
    (operation === 'export'
      ? process.env.COLLABORATORS_SOURCE_URL
      : undefined) ??
    process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL or --url is required')
  if (/^postgres(?:ql)?:/.test(url)) {
    if (operation !== 'export')
      throw new Error(
        'PostgreSQL is a read-only export source, not an import target',
      )
    const output = resolve(
      argument('output') ?? argument('out') ?? 'collaborators-export.csv',
    )
    const csv = await exportPostgresCollaborators(url)
    await writeFile(output, csv, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    console.log(
      `Exported ${parseCsv(csv).length} collaborator assignments to ${output}`,
    )
    return
  }
  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })
  try {
    if (operation === 'export') {
      const output = resolve(
        argument('output') ?? argument('out') ?? 'collaborators-export.csv',
      )
      await writeFile(output, await exportCollaborators(client), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
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
  import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href
) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
