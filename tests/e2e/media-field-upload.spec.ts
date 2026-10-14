import type { Route } from '@playwright/test'
import { expect, test } from './test'

test('a completed file upload preserves newer selections and other edited fields', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/field-parity')
  const removeFirst = page.getByRole('button', {
    name: 'Remove public/images/parity-a.txt',
    exact: true,
  })
  await expect(removeFirst).toBeVisible()
  await page.waitForLoadState('networkidle')
  let receive!: (route: Route) => void
  const held = new Promise<Route>((resolve) => {
    receive = resolve
  })
  let intercepted = false
  await page.route('**/_serverFn/**', async (route) => {
    if (!intercepted && route.request().method() === 'POST') {
      intercepted = true
      receive(route)
    } else await route.continue()
  })
  await page.locator('input[type="file"]').setInputFiles({
    name: 'Parity Upload.TXT',
    mimeType: 'text/plain',
    buffer: Buffer.from('upload'),
  })
  const pending = await held
  await removeFirst.click()
  await page.getByLabel('Date', { exact: true }).fill('2026-10-04')
  await pending.continue()
  await page.unroute('**/_serverFn/**')
  await expect(
    page.getByRole('button', {
      name: 'Remove public/images/parity-upload.txt',
      exact: true,
    }),
  ).toBeVisible()
  await expect(removeFirst).toHaveCount(0)
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(
    '2026-10-04',
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('button', {
      name: 'Remove public/images/parity-upload.txt',
      exact: true,
    }),
  ).toBeVisible()
  await expect(removeFirst).toHaveCount(0)
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(
    '2026-10-04',
  )
})
