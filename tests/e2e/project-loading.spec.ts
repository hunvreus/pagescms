import { encryptFixtureToken } from './auth-fixture'
import { createClient } from '@libsql/client'
import type { Route } from '@playwright/test'
import { expect, test } from './test'

test.setTimeout(60_000)

test.beforeEach(async ({ page }) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.execute({
      sql: "update account set access_token = ? where user_id = 'playwright-user'",
      args: [await encryptFixtureToken('multi-account-projects-token')],
    })
  } finally {
    database.close()
  }
  await page.goto('/')
  await expect(
    page.getByRole('link', { name: 'fixture', exact: true }),
  ).toBeVisible()
  await page.waitForLoadState('networkidle')
})

test('switching accounts replaces old repositories with skeletons and reuses each account cache', async ({
  page,
}) => {
  const projects = page
    .getByRole('heading', { name: 'Open a project', exact: true })
    .locator('..')
  const search = projects.getByPlaceholder('Search by name')
  const loading = projects.getByRole('status', { name: 'Loading repositories' })
  let release!: (route: Route) => void
  const pending = new Promise<Route>((resolve) => {
    release = resolve
  })
  let requests = 0
  await page.route('**/api/repositories**', async (route) => {
    requests++
    if (requests === 1) release(route)
    else await route.continue()
  })

  await projects.getByRole('button', { name: /pagescms/ }).click()
  await page.getByRole('menuitem', { name: /studio/ }).click()
  const request = await pending
  await expect(projects.getByRole('button', { name: /studio/ })).toBeEnabled()
  await expect(search).toBeVisible()
  await expect(search).toBeDisabled()
  await expect(loading).toBeVisible()
  await expect(loading).toHaveAttribute('aria-busy', 'true')
  await expect(
    projects.getByRole('link', { name: 'fixture', exact: true }),
  ).toHaveCount(0)
  await expect(projects.getByText('No repositories available')).toHaveCount(0)

  await request.continue()
  await expect(
    projects.getByRole('link', { name: 'studio-project', exact: true }),
  ).toBeVisible()
  await expect(loading).toHaveCount(0)
  await expect(search).toBeEnabled()
  await projects.getByRole('button', { name: /studio/ }).click()
  await page.getByRole('menuitem', { name: /pagescms/ }).click()
  await expect(
    projects.getByRole('link', { name: 'fixture', exact: true }),
  ).toBeVisible()
  await expect(
    projects.getByRole('link', { name: 'studio-project', exact: true }),
  ).toHaveCount(0)
  await expect(loading).toHaveCount(0)
  await projects.getByRole('button', { name: /pagescms/ }).click()
  await page.getByRole('menuitem', { name: /studio/ }).click()
  await expect(
    projects.getByRole('link', { name: 'studio-project', exact: true }),
  ).toBeVisible()
  await expect(loading).toHaveCount(0)
  expect(requests).toBe(1)
})

test('search keeps the selected account rows during loading and failure, then supports retry', async ({
  page,
}) => {
  const projects = page
    .getByRole('heading', { name: 'Open a project', exact: true })
    .locator('..')
  const fixture = projects.getByRole('link', { name: 'fixture', exact: true })
  const search = projects.getByPlaceholder('Search by name')
  const loading = projects.getByRole('status', { name: 'Loading repositories' })
  let release!: (route: Route) => void
  const pending = new Promise<Route>((resolve) => {
    release = resolve
  })
  let first = true
  let fail = true
  await page.route('**/api/repositories**', async (route) => {
    if (first) {
      first = false
      release(route)
    } else if (fail) await route.abort('failed')
    else await route.continue()
  })

  await search.fill('private')
  const request = await pending
  await expect(fixture).toBeVisible()
  await expect(loading).toHaveCount(0)
  await expect(projects.getByLabel('Filtering repositories')).toBeVisible()
  await expect(projects.getByRole('list')).toHaveAttribute('aria-busy', 'true')
  await expect(search).toBeEnabled()

  await request.abort('failed')
  await expect(projects.getByRole('alert')).toBeVisible()
  await expect(fixture).toBeVisible()
  await expect(loading).toHaveCount(0)
  await expect(projects.getByLabel('Filtering repositories')).toHaveCount(0)
  fail = false
  await projects.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(
    projects.getByRole('link', { name: 'private-fixture', exact: true }),
  ).toBeVisible()
  await expect(fixture).toHaveCount(0)
  await expect(projects.getByRole('alert')).toHaveCount(0)
  await expect(loading).toHaveCount(0)
})

test('recent projects render while repository discovery is still loading', async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      'latestVisits:playwright-user',
      JSON.stringify([
        {
          owner: 'pagescms',
          repo: 'recent-only',
          repoId: '42',
          source: 'github.com',
          branch: 'main',
          timestamp: 1,
        },
      ]),
    )
  })
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.execute({
      sql: "update account set access_token = ? where user_id = 'playwright-user'",
      args: [await encryptFixtureToken('slow-installations-token')],
    })
  } finally {
    database.close()
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(
    page.getByRole('link', { name: 'recent-only', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Loading projects').first()).toBeVisible()
  await expect(page.getByLabel('Loading projects').first()).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'recent-only', exact: true }),
  ).toBeVisible()
})
