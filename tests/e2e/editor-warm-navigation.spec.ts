import { expect, test } from './test'

test.setTimeout(90_000)

for (const dirty of [false, true]) {
  test(`returning to a cached ${dirty ? 'unsaved' : 'clean'} file reuses data without loading placeholders`, async ({
    page,
  }) => {
    await page.goto('/github/pagescms/fixture/main/file/merge-review')
    const title = page.getByRole('textbox', { name: 'Title', exact: true })
    await expect(title).toHaveValue('Original title', { timeout: 45_000 })
    await page.waitForLoadState('networkidle')
    if (dirty) await title.fill('Unsaved title')
    await page.getByRole('link', { name: 'Posts', exact: true }).click()
    await expect(page).toHaveURL(/\/collection\/posts$/)
    await expect(
      page.getByRole('link', { name: 'Hello world', exact: true }),
    ).toBeVisible()
    await expect(title).not.toBeAttached()
    await page.waitForLoadState('networkidle')

    const requests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/files')
        requests.push(request.url())
    })
    await page.evaluate(() => {
      const labels: string[] = []
      const capture = (element: Element) => {
        const label = element.getAttribute('aria-label')
        if (label === 'Loading editor fields' || label === 'Loading entry')
          labels.push(label)
      }
      const observer = new MutationObserver((records) => {
        for (const element of document.querySelectorAll('[aria-label]'))
          capture(element)
        for (const record of records)
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue
            capture(node)
            for (const element of node.querySelectorAll('[aria-label]'))
              capture(element)
          }
      })
      observer.observe(document.body, {
        childList: true,
        attributes: true,
        attributeFilter: ['aria-label'],
        subtree: true,
      })
      Object.assign(window, { editorLoadingLabels: labels })
    })
    await page.getByRole('link', { name: 'Merge review', exact: true }).click()
    await expect(page).toHaveURL(/\/file\/merge-review$/)
    await expect(title).toHaveValue(dirty ? 'Unsaved title' : 'Original title')
    await page.waitForLoadState('networkidle')
    expect(requests).toEqual([])
    expect(
      await page.evaluate(
        () =>
          (window as Window & { editorLoadingLabels?: string[] })
            .editorLoadingLabels,
      ),
    ).toEqual([])
  })
}

test('returning to a cached file sees a draft changed in another tab', async ({
  page,
  context,
}) => {
  const href = '/github/pagescms/fixture/main/file/merge-review'
  await page.goto(href)
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await expect(title).toHaveValue('Original title', { timeout: 45_000 })
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Hello world', exact: true }),
  ).toBeVisible()
  await expect(title).not.toBeAttached()
  await page.waitForLoadState('networkidle')

  const second = await context.newPage()
  await second.goto(href)
  await second.waitForLoadState('networkidle')
  await second
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Draft from another tab')
  await expect(
    second.getByRole('button', {
      name: /^Local draft:/,
    }),
  ).toBeVisible()
  await second.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Merge review', exact: true }).click()
  await expect(title).toHaveValue('Draft from another tab')
})
