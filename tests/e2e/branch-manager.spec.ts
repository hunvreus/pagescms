import { expect, test } from './test'

test('branch commands support filtering and keyboard navigation', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('link', { name: 'Settings', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: /fixture main$/ }).click()
  const settings = page.getByRole('menuitem', { name: 'Settings', exact: true })
  await expect(settings).toBeVisible()
  await expect(settings.locator('svg')).toHaveCount(1)
  await expect(
    page.getByRole('menuitem', { name: 'View on GitHub' }),
  ).not.toHaveAttribute('data-inset', 'true')
  await page.getByRole('menuitem', { name: 'main', exact: true }).hover()
  await page.getByRole('menuitem', { name: 'Manage branches' }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage branches' })
  await expect(
    dialog.getByRole('option').filter({ hasNotText: 'Create branch' }),
  ).toHaveCount(8)
  await expect(
    dialog.getByRole('option', { name: 'main', exact: true }),
  ).toBeVisible()
  const search = dialog.getByRole('combobox')
  await search.fill('preview')
  const branch = dialog.getByRole('option', { name: 'preview', exact: true })
  await expect(branch).toBeVisible()
  await search.press('ArrowDown')
  await search.press('Enter')
  await expect(page).toHaveURL(/\/fixture\/preview\//)
  await expect(dialog).toHaveCount(0)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /fixture preview$/ }).click()
  await page.getByRole('menuitem', { name: 'preview', exact: true }).hover()
  await page.getByRole('menuitem', { name: 'Manage branches' }).click()
  await page.getByRole('combobox').fill('new-search-branch')
  await expect(
    page.getByRole('option', { name: 'Create branch “new-search-branch”' }),
  ).toBeEnabled()
  await expect(page.locator('[data-slot="command-separator"]')).toHaveCount(0)
})
