import { expect, test } from './test'

test('desktop sidebar opens account and About menus and restores focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.route('**/api/app/version', (route) =>
    route.fulfill({ json: { latest: '3.0.0-beta.0' } }),
  )
  await page.goto('/github/pagescms/fixture/main')
  await page.waitForLoadState('networkidle')
  const footer = page.locator('[data-slot="sidebar-footer"]')
  const trigger = footer.getByRole('button', { name: 'User menu', exact: true })
  await expect(trigger).toBeVisible()
  const logo = footer.getByRole('button', {
    name: 'About Pages CMS',
    exact: true,
  })
  await expect(logo).toBeVisible()
  await trigger.click()
  await expect(page.getByRole('menu')).toHaveAttribute('data-side', 'top')
  await expect(
    page.getByRole('menuitem', { name: 'About Pages CMS', exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await logo.click()
  const dialog = page.getByRole('dialog', { name: 'Pages CMS', exact: true })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(logo).toBeFocused()
})

test('the mobile sidebar opens About from its logo and restores focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 })
  await page.route('**/api/app/version', (route) =>
    route.fulfill({ json: { latest: '3.0.0-beta.0' } }),
  )
  await page.goto('/github/pagescms/fixture/main')
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('button', { name: 'Toggle Sidebar', exact: true })
    .click()
  const sidebar = page.locator('[data-slot="sidebar"][data-mobile="true"]')
  const footer = sidebar.locator('[data-slot="sidebar-footer"]')
  const trigger = footer.getByRole('button', { name: 'User menu', exact: true })
  const logo = footer.getByRole('button', {
    name: 'About Pages CMS',
    exact: true,
  })
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(
    page.getByRole('menuitem', { name: 'About Pages CMS', exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await logo.click()
  const dialog = page.getByRole('dialog', { name: 'Pages CMS', exact: true })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(sidebar).toBeVisible()
  await expect(logo).toBeFocused()
  await trigger.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sidebar).toBeHidden()
})
