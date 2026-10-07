import { expect, test } from './test'

test('unconfigured settings remain usable without action errors', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/unconfigured/settings')
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('button', { name: 'Edit configuration', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Cache', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Repository configuration not found', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('region', { name: 'Actions', exact: true })
      .getByText('No actions configured', { exact: true }),
  ).toBeVisible()
  const preview = page.locator('[data-slot="configuration-preview"]')
  const height = await preview
    .locator('.pagescms-code-editor')
    .evaluate((element) => element.getBoundingClientRect().height)
  await expect(
    page
      .getByRole('region', { name: 'Actions', exact: true })
      .locator('[data-slot="empty"]'),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Edit configuration', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Pages CMS configuration' }),
  ).toHaveAttribute('contenteditable', 'true')
  expect(
    await preview
      .locator('.pagescms-code-editor')
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBe(height)
})

test('repository avatar border matches its fallback and loaded image', async ({
  page,
}) => {
  let releaseImage = () => {}
  const pending = new Promise<void>((resolve) => {
    releaseImage = resolve
  })
  await page.route('https://github.com/pagescms.png?size=64', async (route) => {
    await pending
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="lime"/></svg>',
    })
  })
  try {
    await page.goto('/pagescms/fixture/main/settings')
    const avatar = page.locator(
      '[data-slot="sidebar-header"] [data-slot="avatar"]',
    )
    const fallback = avatar.locator('[data-slot="avatar-fallback"]')
    await expect(fallback).toBeVisible()
    const radius = await avatar.evaluate(
      (element) => getComputedStyle(element).borderRadius,
    )
    expect(
      await avatar.evaluate(
        (element) => getComputedStyle(element, '::after').borderRadius,
      ),
    ).toBe(radius)
    await expect(fallback).toHaveCSS('border-radius', radius)
    releaseImage()
    await expect(avatar.locator('[data-slot="avatar-image"]')).toBeVisible()
    await expect(avatar.locator('[data-slot="avatar-image"]')).toHaveCSS(
      'border-radius',
      radius,
    )
  } finally {
    releaseImage()
  }
})
