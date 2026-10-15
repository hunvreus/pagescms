import { expect, test } from './test'

test('repository header borders appear only while the page is scrolled', async ({
  page,
}) => {
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await expect(
    page.getByRole('textbox', { name: 'Body', exact: true }),
  ).toBeVisible()
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 360 })
    await page.evaluate(() => window.scrollTo(0, 0))
    const headers = [page.locator('[data-slot="repository-page-header"]')]
    if (width < 768)
      headers.push(page.locator('[data-slot="repository-mobile-header"]'))
    for (const header of headers)
      await expect(header).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)')
    await page.screenshot({
      path: test.info().outputPath(`header-top-${width}.png`),
      animations: 'disabled',
    })
    await page.evaluate(() => window.scrollTo(0, 150))
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0)
    for (const header of headers)
      await expect(header).not.toHaveCSS(
        'border-bottom-color',
        'rgba(0, 0, 0, 0)',
      )
    await page.screenshot({
      path: test.info().outputPath(`header-scrolled-${width}.png`),
      animations: 'disabled',
    })
    await page.evaluate(() => window.scrollTo(0, 0))
    for (const header of headers)
      await expect(header).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)')
  }
})

test('editor breadcrumbs preload and navigate without reloading the document', async ({
  page,
}) => {
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await page.waitForLoadState('networkidle')
  await page.evaluate(() =>
    document.documentElement.setAttribute('data-navigation-marker', 'retained'),
  )
  const root = page
    .getByRole('navigation', { name: 'breadcrumb' })
    .getByRole('link', { name: 'Posts', exact: true })
  let preloads = 0
  let documentRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/_serverFn/')) preloads++
    if (request.isNavigationRequest() && request.resourceType() === 'document')
      documentRequests++
  })
  await root.hover()
  await expect.poll(() => preloads).toBeGreaterThan(0)
  await page.waitForLoadState('networkidle')
  await root.click()
  await expect(page).toHaveURL(/\/collection\/posts$/)
  await expect(page.getByText('Hello world', { exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute(
    'data-navigation-marker',
    'retained',
  )
  expect(documentRequests).toBe(0)
  await page.getByRole('link', { name: 'Edit', exact: true }).first().click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'Hello world',
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-navigation-marker',
    'retained',
  )
  expect(documentRequests).toBe(0)
})

test('entry history loads with three skeleton rows', async ({ page }) => {
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await page.waitForLoadState('networkidle')
  await page.route('**/_serverFn/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.continue()
  })
  await page.getByRole('button', { name: 'Entry history', exact: true }).click()
  const loading = page.getByRole('status', {
    name: 'Loading history',
    exact: true,
  })
  await expect(loading).toBeVisible()
  await expect(loading.locator(':scope > div')).toHaveCount(3)
  await expect(loading.locator('[data-slot="skeleton"]')).toHaveCount(9)
  await expect(
    page.getByRole('menu').getByText('No history found.', { exact: true }),
  ).toBeVisible()
  await expect(loading).toHaveCount(0)
})
