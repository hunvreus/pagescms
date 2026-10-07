import { expect, test } from './test'

test('repository menu exposes GitHub, settings and branch navigation', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  await page
    .locator('[data-slot="sidebar-header"] [data-slot="dropdown-menu-trigger"]')
    .click()
  const menu = page.locator('[data-slot="dropdown-menu-content"]')
  const items = menu.getByRole('menuitem')
  await expect(items.nth(0)).toHaveText('View on GitHub')
  await expect(items.nth(0)).not.toHaveAttribute('data-inset', 'true')
  await expect(items.nth(0)).toHaveAttribute(
    'href',
    'https://github.com/pagescms/fixture/tree/main',
  )
  await expect(items.nth(1)).toHaveText('Settings')
  await expect(items.nth(2)).toHaveText('main')
  const separator = menu.locator('[role="separator"]').first()
  expect(
    await separator.evaluate(
      (node) => node.previousElementSibling?.textContent,
    ),
  ).toContain('View on GitHub')
  expect(
    await separator.evaluate((node) => node.nextElementSibling?.textContent),
  ).toContain('Settings')
})

test('repository menu closes before slow navigation finishes', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  await page
    .locator('[data-slot="sidebar-header"] [data-slot="dropdown-menu-trigger"]')
    .click()
  await page.route('**/_serverFn/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page
    .getByRole('menuitem', { name: 'All projects', exact: true })
    .click()
  await expect(page.getByRole('menu')).toHaveCount(0, { timeout: 500 })
  await expect(page).toHaveURL(/\/$/)
})

test('branch selection closes both menus before slow navigation finishes', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  await page
    .locator('[data-slot="sidebar-header"] [data-slot="dropdown-menu-trigger"]')
    .click()
  await page.getByRole('menuitem', { name: 'main', exact: true }).hover()
  await expect(
    page.getByRole('menuitem', { name: 'alpha', exact: true }),
  ).toBeVisible()
  await page.route('**/_serverFn/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.getByRole('menuitem', { name: 'alpha', exact: true }).click()
  await expect(page.getByRole('menu')).toHaveCount(0, { timeout: 500 })
  await expect(page).toHaveURL(
    /\/pagescms\/fixture\/alpha(?:\/collection\/posts)?$/,
  )
})
