import { expect, test } from './test'

test('theme preference stays in this browser and applies immediately', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/settings')
  const theme = page.getByRole('combobox', { name: 'Color mode' })
  await expect(theme).toHaveText('System')
  const writes: string[] = []
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname === '/api/account' &&
      request.method() !== 'GET'
    )
      writes.push(request.method())
  })
  await theme.click()
  await page.getByRole('option', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')
  await page.reload()
  await expect(theme).toHaveText('Dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await theme.click()
  await page.getByRole('option', { name: 'System', exact: true }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  expect(writes).toEqual([])
})

test('Account settings remain usable on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/settings')
  const preferences = page.getByRole('combobox', { name: 'Interface language' })
  await expect(preferences).toBeEnabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('textbox', { name: 'Name', exact: true }),
  ).toBeVisible()
  await expect(preferences).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('sign in and About remain accessible on desktop and mobile', async ({
  page,
  context,
  isolation,
}) => {
  await context.clearCookies()
  await page.setExtraHTTPHeaders({
    'x-pagescms-e2e-scope': isolation.scope,
    'x-pagescms-e2e-github-auth': 'true',
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/sign-in')
  await page.waitForLoadState('networkidle')
  const title = page.getByRole('heading', { name: 'Sign in to Pages CMS' })
  await expect(title).toBeVisible()
  await expect(page.getByRole('button', { name: /GitHub/ })).toBeVisible()
  const logo = page.getByRole('button', { name: 'About Pages CMS' })
  await expect(logo).toBeVisible()
  await logo.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(logo).toBeVisible()
  await expect(title).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

for (const [path, heading] of [
  ['/', 'Open a project'],
  ['/admin', 'Admin'],
  ['/settings', 'Account'],
] as const) {
  test(`${heading} keeps account navigation and keyboard focus usable across screen sizes`, async ({
    page,
  }) => {
    await page.route('**/api/app/version', (route) =>
      route.fulfill({ json: { latest: '3.0.0-beta.0' } }),
    )
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const main = page.getByRole('main')
    const title = main.getByRole('heading', { name: heading, exact: true })
    const header =
      path === '/'
        ? page.getByRole('banner')
        : page.locator('[data-slot=sidebar]')
    const logo = header.getByRole('button', {
      name: 'About Pages CMS',
      exact: true,
    })
    const trigger = header.getByRole('button', {
      name: 'User menu',
      exact: true,
    })
    await expect(title).toBeVisible()
    await expect(header).toBeVisible()
    await expect(logo).toBeVisible()
    await expect(page.getByRole('contentinfo')).toHaveCount(0)
    await expect(header.getByRole('heading')).toHaveCount(0)

    for (const width of [1440, 768, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(() => window.scrollTo(0, 0))
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      if (path !== '/' && width < 768) {
        await page
          .getByRole('button', {
            name:
              path === '/admin'
                ? 'Open admin navigation'
                : 'Open account navigation',
          })
          .click()
      }
      await trigger.click()
      const menu = page.getByRole('menu')
      await expect(menu).toBeVisible()
      await expect
        .poll(() =>
          menu.evaluate((element) => element.contains(document.activeElement)),
        )
        .toBe(true)
      await expect(
        menu.getByRole('menuitem', { name: 'About Pages CMS', exact: true }),
      ).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(trigger, `Menu restores focus at ${width}px`).toBeFocused()
      if (width === 1440 || width === 320) {
        await logo.click()
        const dialog = page.getByRole('dialog', {
          name: 'Pages CMS',
          exact: true,
        })
        await expect(dialog).toBeVisible()
        await expect(menu).toBeHidden()
        await expect
          .poll(() =>
            dialog.evaluate((element) =>
              element.contains(document.activeElement),
            ),
          )
          .toBe(true)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(logo).toBeFocused()
      }
    }
    if (path !== '/') {
      await header.getByRole('link', { name: 'Back', exact: true }).click()
      await expect(page).toHaveURL('/')
    }
  })
}
