import postgres from 'postgres'

export default async function globalSetup() {
  const connectionString = process.env.E2E_DATABASE_URL
  if (!connectionString) {
    throw new Error('E2E_DATABASE_URL must be provided by pnpm test:e2e')
  }
  const database = postgres(connectionString, { max: 1 })
  await database`
    insert into "user" (
      id, name, email, email_verified, github_username, created_at, updated_at
    ) values (
      'playwright-user', 'Playwright Editor', 'editor@example.com', true,
      'pagescms', now(), now()
    )
  `
  await database`
    insert into account (
      id, account_id, provider_id, user_id, access_token, created_at, updated_at
    ) values (
      'playwright-github', '1', 'github', 'playwright-user',
      'playwright-github-token', now(), now()
    )
  `
  await database`
    insert into session (
      id, token, user_id, expires_at, created_at, updated_at
    ) values (
      'playwright-session', 'playwright-session-token', 'playwright-user',
      now() + interval '1 day', now(), now()
    )
  `
  await database.end({ timeout: 1 })
}
