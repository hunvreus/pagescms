import type { Page } from '@playwright/test'
import { expect, test } from './test'

test('small row buttons keep their line height outside the table', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/collection/posts')
  const edit = page.getByRole('link', { name: 'Edit', exact: true }).first()
  await expect(edit).toBeVisible()
  const lineHeights = await edit.evaluate((button) => {
    const clone = button.cloneNode(true) as HTMLElement
    const parent = document.createElement('div')
    parent.style.lineHeight = '1.5'
    parent.appendChild(clone)
    document.body.appendChild(parent)
    const result = {
      inTable: getComputedStyle(button).lineHeight,
      outsideTable: getComputedStyle(clone).lineHeight,
    }
    parent.remove()
    return result
  })
  expect(lineHeights.inTable).toBe(lineHeights.outsideTable)
})

for (const width of [390, 850]) {
  test(`collection stays inside the workspace at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/github/pagescms/fixture/main/collection/posts')
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

test('keeps matching entry links mounted as the collection filter changes', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/collection/posts')
  const title = page.getByRole('link', { name: 'Hello world', exact: true })
  await expect(title).toBeVisible()
  const original = await title.evaluateHandle((link) => link)
  const search = page.getByRole('textbox', { name: 'Search collection' })
  await search.pressSequentially('Hello')
  await expect(title).toBeVisible()
  expect(
    await title.evaluate((link, before) => link === before, original),
  ).toBe(true)
  await search.clear()
  expect(
    await title.evaluate((link, before) => link === before, original),
  ).toBe(true)
})

test('keeps fetched children available when filtering an expanded collection', async ({
  page,
}) => {
  await page.route('**/api/collections?**', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    data.collection.view = { ...data.collection.view, layout: 'tree' }
    await route.fulfill({ response, json: data })
  })
  await page.goto(
    '/github/pagescms/fixture/main/collection/folder-languages?locale=en',
  )
  await page.getByRole('button', { name: 'Expand guides' }).click()
  const child = page.getByRole('link', { name: 'About', exact: true })
  await expect(child).toBeVisible()
  await page.getByRole('textbox', { name: 'Search collection' }).fill('guides')
  await expect(child).toBeVisible()
  await page.getByRole('button', { name: 'Collapse guides' }).click()
  await expect(child).toHaveCount(0)
  await page.unrouteAll({ behavior: 'wait' })
})

test('retries a failed collection tree expansion from the table', async ({
  page,
}) => {
  let failChildren = false
  await page.route('**/api/collections?**', async (route) => {
    const url = new URL(route.request().url())
    if (failChildren && url.searchParams.get('path')?.endsWith('/guides')) {
      await route.abort('failed')
      return
    }
    const response = await route.fetch()
    const data = await response.json()
    data.collection.view = { ...data.collection.view, layout: 'tree' }
    await route.fulfill({ response, json: data })
  })
  await page.goto(
    '/github/pagescms/fixture/main/collection/folder-languages?locale=en',
  )
  const expand = page.getByRole('button', { name: 'Expand guides' })
  await expect(expand).toBeVisible()
  failChildren = true
  await expand.click()
  const table = page.locator('table').first()
  await expect(table.getByRole('alert')).toHaveText(
    'Could not load entries for guides.',
  )
  failChildren = false
  await table.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('link', { name: 'About', exact: true }),
  ).toBeVisible()
  await expect(table.getByRole('alert')).toHaveCount(0)
})

for (const paths of [
  ['content/posts/one.md'],
  ['content/posts/one.md', 'content/posts/two.md'],
  [
    'content/posts/one.md',
    'content/posts/two.md',
    'content/posts/three.md',
    'content/posts/four.md',
  ],
]) {
  test(`a collection alert identifies ${paths.length} affected files and refreshes`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    let refreshed = false
    await page.route('**/api/collections?**', async (route) => {
      const response = await route.fetch()
      const data = await response.json()
      if (
        new URL(route.request().url()).searchParams.get('forceRefresh') ===
        'true'
      )
        refreshed = true
      data.parseErrorPaths = refreshed ? [] : paths
      await route.fulfill({ response, json: data })
    })
    await page.goto('/github/pagescms/fixture/main/collection/posts')
    const alert = page
      .getByRole('alert')
      .filter({ hasText: 'Some files may not load properly' })
    await expect(alert).toBeVisible()
    await expect(alert.locator('[data-slot="alert-action"]')).toContainText(
      'Refresh',
    )
    await expect(alert.getByRole('button', { name: 'Refresh' })).toHaveCSS(
      'color',
      await page
        .locator('body')
        .evaluate((body) => getComputedStyle(body).color),
    )
    await expect(
      alert.getByText(paths[0], { exact: paths.length > 1 }),
    ).toBeVisible()
    if (paths.length > 1) {
      await expect(
        alert.getByText(
          `We couldn't read ${paths.length} files. Some fields may be missing.`,
        ),
      ).toBeVisible()
      await expect(alert.getByText(paths[1], { exact: true })).toBeVisible()
    }
    if (paths.length > 3) {
      const toggle = alert.getByRole('button', { name: 'See all files' })
      const normal = await toggle.evaluate((node) => ({
        color: getComputedStyle(node).color,
        decoration: getComputedStyle(node).textDecorationColor,
      }))
      expect(normal.color).not.toBe(normal.decoration)
      await toggle.hover()
      await expect(toggle).toHaveCSS('text-decoration-color', normal.color)
      await expect(alert.getByText(paths[3], { exact: true })).toBeHidden()
      await page.screenshot({ path: testInfo.outputPath('alert-mobile.png') })
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.screenshot({ path: testInfo.outputPath('alert-desktop.png') })
      await alert.getByRole('button', { name: 'See all files' }).click()
      await expect(alert.getByText(paths[3], { exact: true })).toBeVisible()
      await alert.getByRole('button', { name: 'Show fewer files' }).click()
      await expect(alert.getByText(paths[3], { exact: true })).toBeHidden()
    } else {
      await expect(
        alert.getByRole('button', { name: 'See all files' }),
      ).toHaveCount(0)
    }
    await alert.getByRole('button', { name: 'Refresh' }).click()
    await expect(alert).toHaveCount(0)
    expect(refreshed).toBe(true)
  })
}

test('refreshes errors in an expanded folder', async ({ page }) => {
  const refreshedPaths: string[] = []
  await page.route('**/api/collections?**', async (route) => {
    const url = new URL(route.request().url())
    const response = await route.fetch()
    const data = await response.json()
    data.collection.view = { ...data.collection.view, layout: 'tree' }
    const path = url.searchParams.get('path') ?? ''
    if (url.searchParams.get('forceRefresh') === 'true')
      refreshedPaths.push(path)
    if (path.endsWith('/guides') && !refreshedPaths.includes(path))
      data.parseErrorPaths = [`${path}/broken.md`]
    await route.fulfill({ response, json: data })
  })
  await page.goto(
    '/github/pagescms/fixture/main/collection/folder-languages?locale=en',
  )
  await page.getByRole('button', { name: 'Expand guides' }).click()
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'Some files may not load properly' })
  await expect(alert).toContainText('broken.md')
  await alert.getByRole('button', { name: 'Refresh' }).click()
  await expect(alert).toHaveCount(0)
  expect(refreshedPaths).toContain('')
  expect(refreshedPaths.some((path) => path.endsWith('/guides'))).toBe(true)
  await expect(
    page.getByRole('link', { name: 'About', exact: true }),
  ).toBeVisible()
})

test('keeps the warning when refreshing files fails', async ({ page }) => {
  await page.route('**/api/collections?**', async (route) => {
    if (
      new URL(route.request().url()).searchParams.get('forceRefresh') === 'true'
    ) {
      await route.abort('failed')
      return
    }
    const response = await route.fetch()
    const data = await response.json()
    data.parseErrorPaths = ['content/posts/broken.md']
    await route.fulfill({ response, json: data })
  })
  await page.goto('/github/pagescms/fixture/main/collection/posts')
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'Some files may not load properly' })
  await alert.getByRole('button', { name: 'Refresh' }).click()
  await expect(alert).toContainText('content/posts/broken.md')
  await expect(page.getByText('Could not refresh files.')).toBeVisible()
  await expect(alert.getByRole('button', { name: 'Refresh' })).toBeEnabled()
})

test('keeps a collection action menu open when the table updates', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/collection/posts')
  await page.getByRole('button', { name: 'Actions for hello.md' }).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await page.getByPlaceholder('Search entries…').evaluate((element) => {
    const input = element as HTMLInputElement
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set?.call(input, 'Hello')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
})

async function collectionGeometry(page: Page) {
  return page.locator('main table:visible').evaluate((table) => {
    function bounds(element: Element) {
      const { x, y, width, height } = element.getBoundingClientRect()
      return [x, y, width, height].map(Math.round)
    }
    const header = table.closest('main')!.querySelector('header:has(input)')!
    const container = table.parentElement!
    return {
      header: bounds(header),
      search: bounds(header.querySelector('input')!.parentElement!),
      actions: bounds(
        header.querySelector(
          'button[aria-label="New entry"], a[aria-label="New entry"]',
        )!,
      ),
      frame: bounds(container).slice(0, 3),
      columns: Array.from(table.querySelectorAll('thead th'), (cell) => ({
        label: cell.textContent,
        bounds: bounds(cell),
      })),
      firstRow: bounds(table.querySelector('tbody tr')!),
      bodyCells: Array.from(
        table.querySelectorAll('tbody tr:first-child td'),
        bounds,
      ),
      scrollWidth: container.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
    }
  })
}

for (const { width, direct } of [
  { width: 390, direct: false },
  { width: 850, direct: false },
  { width: 1440, direct: false },
  { width: 390, direct: true },
]) {
  test(`collection loading matches the resolved table at ${width}px on ${direct ? 'direct multilingual visit' : 'navigation'}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/collections?**', async (route) => {
      await pending
      await route.continue()
    })
    let loading: Awaited<ReturnType<typeof collectionGeometry>>
    try {
      if (direct) {
        await page.goto(
          '/github/pagescms/fixture/main/collection/languages?locale=fr',
        )
      } else {
        await page.goto('/github/pagescms/fixture/main/file/code')
        await expect(
          page.getByRole('textbox', { name: 'Script' }),
        ).toBeVisible()
        if (width < 768)
          await page.getByRole('button', { name: 'Toggle Sidebar' }).click()
        await page.getByRole('link', { name: 'Posts', exact: true }).click()
        if (width < 768) await page.keyboard.press('Escape')
      }
      const placeholder = page.getByLabel('Loading collection', { exact: true })
      await expect(placeholder.locator('table')).toBeVisible()
      await expect(placeholder.locator('tbody tr')).toHaveCount(5)
      const frame = placeholder.locator('[data-slot="table-container"]')
      await expect(frame).toHaveCSS('border-bottom-style', 'solid')
      await expect(frame).toHaveCSS('border-bottom-left-radius', '14px')
      await expect(
        placeholder.getByRole('textbox', { name: 'Search collection' }),
      ).toBeDisabled()
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      loading = await collectionGeometry(page)
      await page.screenshot({ path: testInfo.outputPath('loading.png') })
    } finally {
      release()
    }
    await expect(
      page.getByRole('link', { name: 'Edit', exact: true }).first(),
    ).toBeVisible()
    const loaded = await collectionGeometry(page)
    await page.screenshot({ path: testInfo.outputPath('loaded.png') })
    expect(loaded.documentWidth).toBeLessThanOrEqual(width)
    expect(loading.header[1]).toBe(loaded.header[1])
    expect(loading.header[3]).toBe(loaded.header[3])
    expect(loading.frame[1]).toBe(loaded.frame[1])
    expect(loading.firstRow[1]).toBe(loaded.firstRow[1])
    expect(loading.firstRow[3]).toBe(loaded.firstRow[3])
  })
}

test('a slow collection keeps one complete placeholder until its data arrives', async ({
  page,
}) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/collections?**', async (route) => {
    await pending
    await route.continue()
  })
  try {
    await page.goto('/github/pagescms/fixture/main/collection/posts')
    const placeholder = page.getByLabel('Loading collection', { exact: true })
    await expect(placeholder.locator('tbody tr')).toHaveCount(5)
    const frame = placeholder.locator('[data-slot="table-container"]')
    await expect(frame).toHaveCSS('border-bottom-style', 'solid')
    await expect(frame).toHaveCSS('border-bottom-left-radius', '14px')
    const before = await placeholder
      .locator('table')
      .evaluate((table) => table.outerHTML)
    await page.waitForTimeout(600)
    await expect(placeholder.locator('tbody tr')).toHaveCount(5)
    expect(
      await placeholder.locator('table').evaluate((table) => table.outerHTML),
    ).toBe(before)
  } finally {
    release()
  }
  await expect(
    page.getByRole('link', { name: 'Edit', exact: true }).first(),
  ).toBeVisible()
})

test('dark collection loading keeps a complete table frame', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/collections?**', async (route) => {
    await pending
    await route.continue()
  })
  try {
    await page.goto('/github/pagescms/fixture/main/collection/posts')
    await expect(page.locator('html')).toHaveClass(/dark/)
    const placeholder = page.getByLabel('Loading collection', { exact: true })
    const frame = placeholder.locator('[data-slot="table-container"]')
    await expect(placeholder.locator('tbody tr')).toHaveCount(5)
    await expect(frame).toHaveCSS('border-bottom-style', 'solid')
    await expect(frame).toHaveCSS('border-bottom-left-radius', '14px')
    await page.screenshot({ path: testInfo.outputPath('dark-loading.png') })
  } finally {
    release()
  }
  await expect(
    page.getByRole('link', { name: 'Edit', exact: true }).first(),
  ).toBeVisible()
})
