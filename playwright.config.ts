import { createHmac } from 'node:crypto'

import { defineConfig, devices } from '@playwright/test'

const authSecret = 'playwright-only-auth-secret-at-least-32-characters'
const sessionToken = 'playwright-session-token'
const signature = createHmac('sha256', authSecret)
  .update(sessionToken)
  .digest('base64')
const sessionCookie = encodeURIComponent(`${sessionToken}.${signature}`)

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    storageState: {
      cookies: [
        {
          name: 'better-auth.session_token',
          value: sessionCookie,
          domain: '127.0.0.1',
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm exec vite dev --host 127.0.0.1 --port 3100 --strictPort',
    env: {
      ...process.env,
      BETTER_AUTH_SECRET: authSecret,
      BETTER_AUTH_URL: 'http://127.0.0.1:3100',
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
      DATABASE_URL:
        process.env.E2E_DATABASE_URL ??
        'postgres://pagescms:pagescms@127.0.0.1:5432/pagescms_playwright',
      PAGESCMS_E2E: 'true',
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://127.0.0.1:3100/api/health',
  },
})
