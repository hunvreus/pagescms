import { createHmac } from 'node:crypto'
import { dirname, join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import { authSecret } from './tests/e2e/auth-fixture'

const sessionToken = 'playwright-session-token'
const signature = createHmac('sha256', authSecret)
  .update(sessionToken)
  .digest('base64')
const sessionCookie = encodeURIComponent(`${sessionToken}.${signature}`)
const githubMetricsPath =
  process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH ??
  (process.env.E2E_DATABASE_URL?.startsWith('file:')
    ? join(
        dirname(process.env.E2E_DATABASE_URL.slice(5)),
        'github-metrics.jsonl',
      )
    : `/tmp/pagescms-e2e-github-${process.pid}.jsonl`)
process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH = githubMetricsPath
const productionE2E = process.env.PAGESCMS_E2E_PRODUCTION === 'true'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  expect: { timeout: 15_000 },
  reporter: productionE2E
    ? [
        [process.env.CI ? 'github' : 'list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
        ['json', { outputFile: 'playwright-report/results.json' }],
      ]
    : process.env.CI
      ? 'github'
      : 'list',
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
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    ...(process.env.PAGESCMS_E2E_CROSS_BROWSER === 'true'
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: productionE2E
      ? 'pnpm exec vite preview --outDir dist/client --host 127.0.0.1 --port 3100 --strictPort'
      : 'pnpm exec vite dev --host 127.0.0.1 --port 3100 --strictPort',
    env: {
      ...process.env,
      ADMIN_EMAILS: 'editor@example.com',
      BETTER_AUTH_SECRET: authSecret,
      BETTER_AUTH_URL: 'http://127.0.0.1:3100',
      DATABASE_URL:
        process.env.E2E_DATABASE_URL ?? 'file:.data/pagescms-playwright.db',
      PAGESCMS_E2E: 'true',
      PAGESCMS_E2E_GITHUB_METRICS_PATH: githubMetricsPath,
      VITE_DISABLE_TANSTACK_DEVTOOLS: 'true',
      VITE_DISABLE_UNSAVED_WARNING: 'true',
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: 'http://127.0.0.1:3100/api/health',
  },
})
