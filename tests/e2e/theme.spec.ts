import { expect, test } from './test'

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} theme keeps table scrolling and dialog controls usable`, async ({
    page,
  }) => {
    await page.addInitScript((value) => {
      localStorage.setItem('theme', value)
    }, theme)
    await page.goto('/github/pagescms/fixture/main/collaborators')
    await page.waitForLoadState('networkidle')
    const invite = page
      .locator('[data-slot="repository-page-header"]')
      .getByRole('button', { name: 'Invite collaborator' })
    await expect(invite).toBeVisible()
    await invite.focus()
    await expect(page.locator('html')).toHaveCSS('color-scheme', theme)
    await expect(page.locator('[data-slot="table-container"]')).toHaveCSS(
      'overflow-x',
      'auto',
    )
    await invite.click()
    const dialog = page.getByRole('dialog', { name: 'Invite collaborators' })
    await expect(dialog).toBeVisible()
    const close = dialog.getByRole('button', { name: 'Close', exact: true })
    await close.hover()
    await dialog.getByLabel('Email addresses').focus()
    await expect(dialog.getByLabel('Email addresses')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(invite).toBeEnabled()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(invite).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390)
  })
}
