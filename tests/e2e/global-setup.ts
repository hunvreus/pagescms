import { createDatabase } from '#/server/database/client.server'
import { accountTable, sessionTable, userTable } from '#/server/database/schema'

export default async function globalSetup() {
  const databaseUrl = process.env.E2E_DATABASE_URL
  if (!databaseUrl) {
    throw new Error('E2E_DATABASE_URL must be provided by pnpm test:e2e')
  }
  const database = createDatabase({ url: databaseUrl })
  const now = new Date()
  await database.insert(userTable).values({
    id: 'playwright-user',
    name: 'Playwright Editor',
    email: 'editor@example.com',
    emailVerified: true,
    githubUsername: 'pagescms',
    createdAt: now,
    updatedAt: now,
  })
  await database.insert(accountTable).values({
    id: 'playwright-github',
    accountId: '1',
    providerId: 'github',
    issuer: 'local:oauth:github',
    userId: 'playwright-user',
    accessToken: 'playwright-github-token',
    createdAt: now,
    updatedAt: now,
  })
  await database.insert(sessionTable).values({
    id: 'playwright-session',
    token: 'playwright-session-token',
    userId: 'playwright-user',
    expiresAt: new Date(now.getTime() + 86_400_000),
    createdAt: now,
    updatedAt: now,
  })
}
