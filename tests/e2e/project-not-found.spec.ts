import { expect, test } from './test'

const project = '/github/pagescms/fixture/main'
for (const path of ['/github/pagescms/fixture', `${project}/actions`]) {
  for (const status of [403, 404]) {
    test(`shows an unavailable repository for ${status} at ${path}`, async ({
      page,
    }) => {
      await page.route('**/api/repository?**', (route) =>
        route.fulfill({ status, json: {} }),
      )
      await page.goto(path)
      await expect(
        page.getByText('Repository not found', { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByText(/may not exist, or you may not have access/),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Back to projects' }),
      ).toBeVisible()
    })
  }
}
for (const path of [
  '/collection/missing',
  '/file/missing',
  '/media/missing',
  '/missing',
  '/missing/deep/path',
  '/collection/posts/entry/content/posts/missing.md',
]) {
  test(`keeps project navigation for missing ${path}`, async ({ page }) => {
    const response = await page.goto(project + path)
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(/Page not found|Page introuvable/)
    await expect(
      page.getByText('Page not found', { exact: true }),
    ).toBeVisible()
    await expect(
      page
        .locator('[data-slot="sidebar"]')
        .getByRole('link', { name: 'Overview', exact: true }),
    ).toBeVisible()
    const state = page.locator('[data-slot="project-route-state"]')
    const bounds = await state.boundingBox()
    const empty = await state.locator('[data-slot="empty"]').boundingBox()
    expect(bounds).not.toBeNull()
    expect(empty).not.toBeNull()
    expect(
      Math.abs(empty!.y + empty!.height / 2 - page.viewportSize()!.height / 2),
    ).toBeLessThan(3)
    expect(
      Math.abs(empty!.x + empty!.width / 2 - (bounds!.x + bounds!.width / 2)),
    ).toBeLessThan(3)
    await expect(state.getByText('Project', { exact: true })).toHaveCount(0)
    const link = page.getByRole('link', {
      name: 'Go to overview',
      exact: true,
    })
    await expect(link).toHaveAttribute('href', project)
    if (path === '/collection/missing')
      await page.screenshot({ path: '.tmp/project-404-desktop.png' })
    await link.click()
    await expect(page).toHaveURL(project)
    await expect(page.getByText('Page not found', { exact: true })).toHaveCount(
      0,
    )
  })
}
test('renders a French scoped 404 after loading the SPA', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'pagescms-language', value: 'fr', domain: '127.0.0.1', path: '/' },
  ])
  const response = await page.goto(project + '/collection/missing')
  expect(response?.status()).toBe(200)
  await expect(page).toHaveTitle(/Page not found|Page introuvable/)
  await expect(
    page.getByText('Page introuvable', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', {
      name: 'Voir l’aperçu',
      exact: true,
    }),
  ).toHaveAttribute('href', project)
})

test('keeps the project navigation usable on a mobile 404', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(project + '/collection/missing')
  await expect(
    page.getByRole('button', { name: 'Toggle Sidebar' }),
  ).toBeEnabled()
  const block = await page.locator('[data-slot=empty]').boundingBox()
  expect(Math.abs(block!.y + block!.height / 2 - 844 / 2)).toBeLessThan(3)
  await page.screenshot({ path: '.tmp/project-404-mobile.png' })
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click()
  await expect(
    page.getByRole('link', { name: 'Overview', exact: true }),
  ).toBeVisible()
})
