import type { Page, Route } from '@playwright/test'
import { eq } from 'drizzle-orm'
import { createDatabase } from '#/server/database/client.server'
import { collaboratorTable } from '#/server/database/schema'
import { expect, test } from './test'

async function holdWrite(page: Page) {
  let receive!: (route: Route) => void
  const held = new Promise<Route>((resolve) => {
    receive = resolve
  })
  let intercepted = false
  await page.route('**/*', async (route) => {
    if (!intercepted && route.request().method() === 'POST') {
      intercepted = true
      receive(route)
    } else await route.continue()
  })
  return held
}
test('branch creation completes after leaving without redirecting the user back', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /fixture main$/ }).click()
  await page
    .getByRole('menuitem', { name: 'Branch: main', exact: true })
    .hover()
  await page
    .getByRole('menuitem', { name: 'Create branch…', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Create branch',
    exact: true,
  })
  await dialog
    .getByRole('textbox', { name: 'Branch name' })
    .fill('background-branch')
  await expect(
    dialog.getByRole('button', { name: 'Create branch', exact: true }),
  ).toBeEnabled()
  const held = holdWrite(page)
  await dialog
    .getByRole('button', { name: 'Create branch', exact: true })
    .click()
  const route = await held
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await route.continue()
  await page.unroute('**/*')
  await expect(
    page.getByText('Branch “background-branch” created', { exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/fixture\/main$/)
  await page.getByRole('button', { name: /fixture main$/ }).click()
  await page
    .getByRole('menuitem', { name: 'Branch: main', exact: true })
    .hover()
  await page.getByRole('menuitem', { name: 'All branches…' }).click()
  await expect(
    page.getByRole('option', { name: 'background-branch', exact: true }),
  ).toBeVisible()
})
test('collaborator removal completes after navigation and keeps membership until confirmed', async ({
  page,
}) => {
  const database = createDatabase({ url: process.env.E2E_DATABASE_URL! })
  const [member] = await database
    .insert(collaboratorTable)
    .values({
      type: 'github',
      installationId: 1,
      ownerId: 1,
      owner: 'pagescms',
      repo: 'fixture',
      email: 'background@example.com',
    })
    .returning({ id: collaboratorTable.id })
  try {
    await page.goto('/pagescms/fixture/main/collaborators')
    await page.waitForLoadState('networkidle')
    await page
      .getByRole('button', { name: 'Remove background@example.com' })
      .click()
    const held = holdWrite(page)
    const dialog = page.getByRole('alertdialog')
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
    const route = await held
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Remove background@example.com' }),
    ).toBeDisabled()
    await page.getByRole('link', { name: 'Overview', exact: true }).click()
    await route.continue()
    await page.unroute('**/*')
    await expect(
      page.getByText('Collaborator removed', { exact: true }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Collaborators', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Remove background@example.com' }),
    ).toHaveCount(0)
  } finally {
    await database
      .delete(collaboratorTable)
      .where(eq(collaboratorTable.id, member.id))
  }
})

test('a branch completion never redirects through a dialog that unmounted during history navigation', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'User menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/collection\/posts$/)
  await page.getByRole('button', { name: /fixture main$/ }).click()
  await page
    .getByRole('menuitem', { name: 'Branch: main', exact: true })
    .hover()
  await page
    .getByRole('menuitem', { name: 'Create branch…', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Create branch',
    exact: true,
  })
  await dialog
    .getByRole('textbox', { name: 'Branch name' })
    .fill('history-branch')
  await expect(
    dialog.getByRole('button', { name: 'Create branch', exact: true }),
  ).toBeEnabled()
  const held = holdWrite(page)
  await dialog
    .getByRole('button', { name: 'Create branch', exact: true })
    .click()
  const route = await held
  await page.goForward()
  await expect(page).toHaveURL(/\/settings$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/collection\/posts$/)
  await expect(dialog).toHaveCount(0)
  await route.continue()
  await page.unroute('**/*')
  await expect(
    page.getByText('Branch “history-branch” created', { exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/collection\/posts$/)
})
