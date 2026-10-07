import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { createClient } from '@libsql/client'
import { test as base, expect } from '@playwright/test'

// Each test receives its own seeded database, cache, forge state and metrics.
// Isolation also applies to retries; cleanup is owned by test-e2e.sh's temp dir.
export const test = base.extend<{ isolation: { scope: string } }>({
  isolation: [
    // Playwright requires destructuring for its fixture dependency parser.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const seed = process.env.E2E_DATABASE_URL
      const metrics = process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH
      if (!seed?.startsWith('file:') || !metrics)
        throw new Error('Isolated E2E seed is required')
      const scope = randomUUID()
      const filename = join(dirname(seed.slice(5)), `${scope}.db`)
      const client = createClient({ url: seed })
      try {
        await client.execute({ sql: 'VACUUM INTO ?', args: [filename] })
      } finally {
        client.close()
      }
      process.env.E2E_DATABASE_URL = `file:${filename}`
      process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH = `${metrics}.${scope}`
      try {
        await use({ scope })
      } finally {
        process.env.E2E_DATABASE_URL = seed
        process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH = metrics
      }
    },
    { auto: true },
  ],
  extraHTTPHeaders: async ({ isolation }, use) => {
    await use({ 'x-pagescms-e2e-scope': isolation.scope })
  },
})
export { expect }
