import type { Page, Route } from '@playwright/test'
import { expect, test } from './test'
import { configuration } from './github-fixture.server'

test.setTimeout(60_000)

async function holdWrite(page: Page, endpoint: string) {
  let receive!: (route: Route) => void
  const held = new Promise<Route>((resolve) => {
    receive = resolve
  })
  let intercepted = false
  await page.route(`**${endpoint}`, async (route) => {
    if (
      !intercepted &&
      ['POST', 'PATCH', 'DELETE'].includes(route.request().method())
    ) {
      intercepted = true
      receive(route)
    } else await route.continue()
  })
  return held
}

test('folder creation remains tracked after navigation and cannot be submitted twice', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'New folder', exact: true }).click()
  let dialog = page.getByRole('dialog', {
    name: 'Create a folder',
    exact: true,
  })
  await dialog
    .getByRole('textbox', { name: 'Folder path' })
    .fill('background-folder')
  const held = holdWrite(page, '/api/entry-folders')
  await dialog
    .getByRole('button', { name: 'Create folder', exact: true })
    .click()
  const route = await held
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await page
    .getByRole('link', { name: 'Posts', exact: true })
    .and(page.locator('a'))
    .click()
  await page.getByRole('button', { name: 'New folder', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Create a folder', exact: true })
  await dialog.getByRole('textbox', { name: 'Folder path' }).fill('duplicate')
  await expect(
    dialog.getByRole('button', { name: 'Create folder', exact: true }),
  ).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await route.continue()
  await page.unroute('**/api/entry-folders')
  await expect(page.getByText('Folder created', { exact: true })).toBeVisible()
  await expect(page).toHaveURL('/github/pagescms/fixture/main')
  await page
    .getByRole('link', { name: 'Posts', exact: true })
    .and(page.locator('a'))
    .click()
  await expect(
    page.getByText('background-folder', { exact: true }),
  ).toBeVisible()
})

test('a profile save completes off-page and remains pending when Account is reopened', async ({
  page,
}) => {
  await page.goto('/settings')
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Background profile')
  const held = holdWrite(page, '/api/account')
  await page.getByRole('textbox', { name: 'Name', exact: true }).press('Enter')
  const route = await held
  await page.getByRole('link', { name: 'Back', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Open a project', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'User menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Account', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  await expect(name).toHaveAttribute('aria-busy', 'true')
  await expect(name).toBeEnabled()
  await name.fill('Newer background name')
  const response = page.waitForResponse(
    (reply) =>
      reply.request().method() === 'PATCH' &&
      new URL(reply.url()).pathname === '/api/account',
  )
  await route.continue()
  expect((await response).ok()).toBe(true)
  await page.unroute('**/api/account')
  await expect(name).toHaveAttribute('aria-busy', 'false')
  await expect(name).toHaveValue('Newer background name')
  const success = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: 'Profile updated' })
  await expect(success).toHaveCount(0)
  const save = page
    .getByRole('region', { name: 'Profile', exact: true })
    .getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(success).toBeVisible()
  await page.reload()
  await expect(name).toHaveValue('Newer background name')
})

test('node promotion completes after leaving without opening a stale entry creator', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/configuration')
  const editor = page.getByRole('textbox', { name: 'Configuration' })
  await editor.fill(
    configuration.replace(
      '    path: content/posts\n',
      '    path: content/posts\n    view:\n      layout: tree\n      node:\n        filename: index.md\n',
    ),
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('Configuration saved', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Posts', exact: true })
    .and(page.locator('a'))
    .click()
  const row = page.getByRole('row').filter({ hasText: 'Hello world' })
  await expect(
    row.locator('xpath=ancestor::div[@aria-busy][1]'),
  ).toHaveAttribute('aria-busy', 'false')
  await row
    .getByRole('button', { name: 'Actions for hello.md', exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Add child', exact: true }).click()
  const dialog = page.getByRole('alertdialog', {
    name: 'Move this entry first?',
  })
  const held = holdWrite(page, '/api/entries/path')
  await dialog
    .getByRole('button', { name: 'Move and continue', exact: true })
    .click()
  const route = await held
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await route.continue()
  await page.unroute('**/api/entries/path')
  await expect(
    page.getByText('Previously content/posts/hello.md', { exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL('/github/pagescms/fixture/main')
  await page.reload()
  await expect(page).toHaveURL('/github/pagescms/fixture/main')
})
