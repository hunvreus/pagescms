import { expect, test } from './test'

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`direct image delivery stays usable on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const proxied: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/media-preview/'))
        proxied.push(request.url())
    })
    await page.goto('/github/pagescms/fixture/main/media/default')
    await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
    const image = page.locator('img[src*="asset="]').first()
    await expect(image).toBeVisible()
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true)
    await expect(image.locator('..')).toHaveAttribute('data-state', 'loaded')
    expect(proxied).toEqual([])
    await page.screenshot({
      path: `.tmp/media-implementation/${viewport.name}-direct-media.png`,
      fullPage: true,
    })
  })
}

for (const format of ['markdown', 'html'])
  test(`rich-text ${format} display uses direct URLs while saved source stays repository-relative`, async ({
    page,
  }) => {
    const proxied: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/media-preview/'))
        proxied.push(request.url())
    })
    await page.goto(
      format === 'markdown'
        ? '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
        : '/github/pagescms/fixture/main/file/html-editor',
    )
    await page.locator('.ProseMirror').waitFor()
    await page.getByRole('radio', { name: 'Source', exact: true }).click()
    const source = page.locator('textarea')
    const original = await source.inputValue()
    await source.fill(
      format === 'markdown'
        ? `${original}\n\n![Preview](/public/images/hero.svg)\n`
        : `${original}<p><img src="/public/images/hero.svg" alt="Preview"></p>`,
    )
    await page.getByRole('radio', { name: 'Editor', exact: true }).click()
    const image = page.locator('.ProseMirror img').last()
    await expect(image).toHaveAttribute('src', /favicon\.svg\?asset=/)
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true)
    expect(proxied).toEqual([])
    await page.getByRole('radio', { name: 'Source', exact: true }).click()
    expect(await source.inputValue()).toContain('/public/images/hero.svg')
    expect(await source.inputValue()).not.toContain('favicon.svg')
    expect(await source.inputValue()).not.toContain('/api/media-preview/')
  })

for (const view of ['grid', 'list'])
  for (const width of [1280, 390])
    test(`media ${view} pagination at ${width}px bounds mounted entries and searches the complete folder`, async ({
      page,
    }) => {
      await page.goto(
        '/github/pagescms/fixture/main/media/default?path=public%2Fimages%2Fpagination-test',
      )
      await page.setViewportSize({ width, height: 844 })
      if (view === 'list')
        await page.getByRole('radio', { name: /list/i }).click()
      const pagination = page.getByRole('navigation', {
        name: 'Media pagination',
      })
      await expect(pagination).toContainText('1–100 of 205')
      await expect(
        page.getByText('image-001.svg', { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByText('image-101.svg', { exact: true }),
      ).toHaveCount(0)
      await pagination
        .getByRole('button', { name: 'Next', exact: true })
        .click()
      await expect(pagination).toContainText('101–200 of 205')
      await expect(
        page.getByText('image-001.svg', { exact: true }),
      ).toHaveCount(0)
      await expect(
        page.getByText('image-101.svg', { exact: true }),
      ).toBeVisible()
      await expect(
        page.getByText('image-101.svg', { exact: true }),
      ).toBeInViewport()
      await pagination.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: `.tmp/media-implementation/${view}-${width}-pagination.png`,
      })
      await page
        .getByPlaceholder('Search media')
        .filter({ visible: true })
        .fill('image-205')
      await expect(
        page.getByText('image-205.svg', { exact: true }),
      ).toBeVisible()
      await expect(pagination).toHaveCount(0)
      await page.screenshot({
        path: `.tmp/media-implementation/${view}-paginated-media.png`,
        fullPage: true,
      })
    })
