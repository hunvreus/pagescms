import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
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
      BETTER_AUTH_SECRET: 'playwright-only-auth-secret-at-least-32-characters',
      BETTER_AUTH_URL: 'http://127.0.0.1:3100',
      CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
      DATABASE_URL:
        'postgres://pagescms:pagescms@127.0.0.1:5432/pagescms_playwright',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: 'http://127.0.0.1:3100/api/health',
  },
})
