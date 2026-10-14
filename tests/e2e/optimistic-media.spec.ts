import type { Page, Route } from '@playwright/test'
import { expect, test } from './test'

const media = '/pagescms/fixture/main/media/default'
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
test('rename survives navigation and keeps pending items unavailable until confirmed', async ({
  page,
}) => {
  await page.goto(media)
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Actions for hero.svg' }).click()
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Rename file' })
  await dialog.getByRole('textbox').fill('renamed.svg')
  const held = holdWrite(page)
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click()
  const route = await held
  await expect(page.getByText('Renaming…', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Actions for renamed.svg' }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await page.getByRole('link', { name: 'Media', exact: true }).first().click()
  await expect(page.getByText('Renaming…', { exact: true })).toBeVisible()
  await route.continue()
  await page.unroute('**/*')
  await expect(
    page.getByRole('button', { name: 'Actions for renamed.svg' }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByText('renamed.svg', { exact: true })).toBeVisible()
})
test('failed delete restores only its item after an unrelated upload succeeds', async ({
  page,
}) => {
  await page.goto(media)
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Actions for hero.svg' }).click()
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  const held = holdWrite(page)
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  const route = await held
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('hero.svg', { exact: true })).toHaveCount(0)
  await page.locator('input[type="file"]').setInputFiles({
    name: 'other.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  })
  await expect(
    page.getByRole('button', { name: 'Actions for other.svg' }),
  ).toBeVisible()
  await route.abort('failed')
  await page.unroute('**/*')
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
  await expect(page.getByText('other.svg', { exact: true })).toBeVisible()
})
test('upload completes in its original folder after navigating elsewhere', async ({
  page,
}) => {
  await page.goto(media)
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  const held = holdWrite(page)
  await page.locator('input[type="file"]').setInputFiles({
    name: 'background.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  })
  const route = await held
  await expect(
    page.getByRole('button', { name: 'Uploading…', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Actions for background.svg' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByText('nested.svg', { exact: true })).toBeVisible()
  await route.continue()
  await page.unroute('**/*')
  await expect(page.getByText('background.svg', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Media', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Actions for background.svg' }),
  ).toBeVisible()
})

test('pending folder is unavailable and a failed create leaves existing folders intact', async ({
  page,
}) => {
  await page.goto(media)
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'New folder', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New folder', exact: true })
  await dialog.getByRole('textbox').fill('Pending folder')
  const held = holdWrite(page)
  await dialog
    .getByRole('button', { name: 'Create folder', exact: true })
    .click()
  const route = await held
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: /Pending folder/ }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Library', exact: true }),
  ).toBeEnabled()
  await route.abort('failed')
  await page.unroute('**/*')
  await expect(
    page.getByRole('button', { name: /Pending folder/ }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Library', exact: true }),
  ).toBeEnabled()
})
