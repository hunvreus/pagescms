import type { Route } from '@playwright/test'
import { expect, test } from './test'

test('workflow dispatch survives navigation and prevents another dispatch until acknowledged', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
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
  await page
    .getByRole('button', { name: 'Run immediately', exact: true })
    .click()
  const route = await held
  await page.getByRole('link', { name: 'Actions', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Run', exact: true }),
  ).toBeDisabled()
  await route.continue()
  await page.unroute('**/*')
  await expect(
    page.getByRole('button', { name: 'Run', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('table')).toContainText('immediate-test')
})

test('a dispatch confirmation can be closed while the workflow request finishes in the background', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('button', { name: 'Confirm workflow', exact: true })
    .click()
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
  const dialog = page.getByRole('alertdialog', {
    name: 'Deploy site?',
    exact: true,
  })
  await dialog.getByRole('button', { name: 'Deploy', exact: true }).click()
  const route = await held
  const deploy = dialog.getByRole('button', { name: 'Deploy', exact: true })
  await expect(deploy).toBeDisabled()
  await expect(deploy).toHaveAttribute('aria-busy', 'true')
  await expect(deploy.locator('[data-slot="spinner"]')).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('link', { name: 'Actions', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Run', exact: true }),
  ).toBeDisabled()
  await route.continue()
  await page.unroute('**/*')
  await expect(
    page.getByRole('button', { name: 'Run', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('table')).toContainText('confirmed-test')
})
