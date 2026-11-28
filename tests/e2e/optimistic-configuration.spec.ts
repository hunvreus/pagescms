import type { Route } from '@playwright/test'
import { expect, test } from './test'
import { configuration } from './github-fixture.server'

test('configuration save survives navigation and rebases later edits', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/configuration')
  const editor = page.getByRole('textbox', { name: 'Configuration' })
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await page.waitForLoadState('networkidle')
  await editor.fill(`# Submitted\n${configuration}`)
  let receive!: (route: Route) => void
  const held = new Promise<Route>((resolve) => {
    receive = resolve
  })
  let intercepted = false
  await page.route('**/*', async (route) => {
    if (
      !intercepted &&
      ['POST', 'PATCH', 'DELETE'].includes(route.request().method())
    ) {
      intercepted = true
      receive(route)
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const route = await held
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.press('ControlOrMeta+Home')
  await editor.press('Shift+End')
  await editor.pressSequentially('# Later edit')
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Local drafts' })).toContainText(
    'Configuration',
  )
  await page
    .getByRole('list', { name: 'Local drafts' })
    .getByRole('link', { name: 'Configuration', exact: true })
    .click()
  await expect(editor).toContainText('# Later edit')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await route.continue()
  await page.unroute('**/*')
  await expect(
    page.getByText('Configuration saved', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await page
    .getByRole('list', { name: 'Local drafts' })
    .getByRole('link', { name: 'Configuration', exact: true })
    .click()
  await expect(editor).toContainText('# Later edit')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('Configuration saved', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(editor).toContainText('# Later edit')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
})
