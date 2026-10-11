import { expect, test } from './test'

for (const width of [390, 850]) {
  test(`collection stays inside the workspace at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/pagescms/fixture/main/collection/posts')
    const edit = page.getByRole('link', { name: 'Edit', exact: true }).first()
    await expect(edit).toBeVisible()

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    const newEntry = await page
      .getByRole('link', { name: 'New entry', exact: true })
      .boundingBox()
    expect(newEntry!.x + newEntry!.width).toBeLessThanOrEqual(width)
    const bounds = await edit.evaluate((button) => {
      const link = button.getBoundingClientRect()
      const cell = button.closest('td')!.getBoundingClientRect()
      return { left: link.left - cell.left, right: cell.right - link.right }
    })
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeGreaterThanOrEqual(0)
  })
}

test('collection loading table stays inside the workspace', async ({
  page,
}) => {
  await page.setViewportSize({ width: 850, height: 900 })
  await page.goto('/pagescms/fixture/main/file/code')
  await expect(page.getByRole('textbox', { name: 'Script' })).toBeVisible()
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    await pending
    await route.continue()
  })
  try {
    await page.getByRole('link', { name: 'Posts', exact: true }).click()
    await expect(
      page.getByLabel('Loading collection', { exact: true }),
    ).toBeVisible()
    const skeleton = page.getByLabel('Loading collection', { exact: true })
    const visibleColumns: number[] = []
    for (const width of [390, 850, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await expect
        .poll(async () => {
          return page.evaluate(() => document.documentElement.scrollWidth)
        })
        .toBeLessThanOrEqual(width)
      await expect
        .poll(async () => {
          return skeleton
            .locator('[data-slot="table-container"]')
            .evaluate(
              (container) => container.scrollWidth - container.clientWidth,
            )
        })
        .toBe(0)
      visibleColumns.push(await skeleton.locator('th:visible').count())
    }
    expect(visibleColumns[0]).toBeLessThan(visibleColumns[1])
    expect(visibleColumns[1]).toBeLessThan(visibleColumns[2])
  } finally {
    release()
  }
  await expect(
    page.getByRole('link', { name: 'Edit', exact: true }).first(),
  ).toBeVisible()
})
