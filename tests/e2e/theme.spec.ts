import { expect, test } from './test'

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} theme keeps table scrolling and dialog controls usable`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value)
    }, theme)
    await page.goto('/pagescms/fixture/main/settings')
    await page.waitForLoadState('networkidle')
    const collaborators = page.getByRole('region', {
      name: 'Collaborators',
      exact: true,
    })
    const invite = collaborators.getByRole('button', {
      name: 'Invite collaborator',
    })
    await expect(invite).toBeVisible()
    await expect(invite).toHaveCSS('height', '28px')
    await invite.focus()
    const workflow = page
      .getByRole('region', { name: 'Actions', exact: true })
      .getByText('deploy.yml', { exact: true })
    await expect(workflow).toBeVisible()
    await expect(
      page
        .getByRole('region', { name: 'Actions', exact: true })
        .getByText('Workflow: deploy.yml', { exact: true }),
    ).toHaveCount(0)
    await expect(page.locator('html')).toHaveCSS('color-scheme', theme)
    await expect(
      collaborators.locator('[data-slot="table-container"]'),
    ).toHaveCSS('overflow-x', 'auto')
    await invite.click()
    const dialog = page.getByRole('dialog', { name: 'Invite collaborators' })
    await expect(dialog).toBeVisible()
    const close = dialog.getByRole('button', { name: 'Close', exact: true })
    await close.hover()
    await dialog.getByLabel('Email addresses').focus()
    await expect(dialog.getByLabel('Email addresses')).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath(`${theme}-dialog.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(invite).toBeEnabled()
    await page.screenshot({
      path: testInfo.outputPath(`${theme}-settings.png`),
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(invite).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390)
    await page.screenshot({ path: testInfo.outputPath(`${theme}-mobile.png`) })
  })
}

test('project dropdown triggers and navigation use a single keyboard focus edge', async ({
  page,
}) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const trigger = page
    .locator('[data-slot="dropdown-menu-trigger"]')
    .filter({ hasText: 'pagescms' })
    .first()
  await trigger.focus()
  await trigger.click()
  await expect(page.getByRole('menu')).toBeVisible()
  const menu = page.getByRole('menu')
  // Radix can retain focus on the popup while its items load or the pointer leaves them.
  await menu.focus()
  await expect(menu).toBeFocused()
  await menu.getByRole('menuitem').first().hover()
  await page.mouse.move(0, 0)
  await page.keyboard.press('Escape')
  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  const navigation = page.locator('[data-sidebar="menu-button"]').first()
  await navigation.focus()
  await page.goto('/pagescms/fixture/main/file/field-parity')
  await page.waitForLoadState('networkidle')
  const select = page.getByRole('combobox')
  await select.focus()
  await select.click()
  await expect(page.getByRole('option', { name: 'Published' })).toBeVisible()
  const listbox = page.getByRole('listbox')
  await listbox.focus()
  await page.keyboard.press('Escape')
})
