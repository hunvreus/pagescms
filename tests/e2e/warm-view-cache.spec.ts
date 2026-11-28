import { expect, test } from './test'
import type { Page } from '@playwright/test'

declare global {
  interface Window {
    warmViewCacheAudit?: { reads: number; labels: string[] }
  }
}

test.setTimeout(90_000)

async function installLocalReadDelay(page: Page) {
  await page.addInitScript(() => {
    window.warmViewCacheAudit = { reads: 0, labels: [] }
    const descriptor = Object.getOwnPropertyDescriptor(
      IDBRequest.prototype,
      'onsuccess',
    )!
    Object.defineProperty(IDBRequest.prototype, 'onsuccess', {
      ...descriptor,
      set(listener: ((this: IDBRequest, event: Event) => void) | null) {
        descriptor.set!.call(
          this,
          listener &&
            function (this: IDBRequest, event: Event) {
              const request = this
              if (
                request.source instanceof IDBIndex &&
                request.source.objectStore.transaction.mode === 'readonly' &&
                ['summaries', 'recent'].includes(
                  request.source.objectStore.name,
                )
              )
                setTimeout(() => {
                  listener.call(request, event)
                  window.warmViewCacheAudit!.reads++
                }, 150)
              else listener.call(request, event)
            },
        )
      },
    })
  })
}

test('Overview retains local lists while refreshing a slow IndexedDB read', async ({
  page,
}) => {
  await installLocalReadDelay(page)
  await page.goto('/github/pagescms/fixture/main')
  const empty = page.getByText('No drafts saved on this device.', {
    exact: true,
  })
  await expect(empty).toBeVisible({ timeout: 45_000 })
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Hello world', exact: true }),
  ).toBeVisible()
  const reads = await page.evaluate(() => window.warmViewCacheAudit?.reads ?? 0)
  await page.evaluate(() => {
    const labels: string[] = []
    const capture = (element: Element) => {
      for (const item of [
        element,
        ...element.querySelectorAll('[aria-label]'),
      ]) {
        const label = item.getAttribute('aria-label')
        if (
          label === 'Loading drafts' ||
          label === 'Loading recently visited entries'
        )
          labels.push(label)
      }
    }
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target instanceof Element) capture(record.target)
        for (const node of record.addedNodes)
          if (node instanceof Element) capture(node)
      }
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    })
    window.warmViewCacheAudit!.labels = labels
  })
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(empty).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.warmViewCacheAudit?.reads ?? 0))
    .toBeGreaterThanOrEqual(reads + 2)
  expect(
    await page.evaluate(() => window.warmViewCacheAudit?.labels ?? []),
  ).toEqual([])
})

test('reference labels and browse options survive leaving the editor without repeated requests', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/selection-controls')
  const related = page.getByRole('combobox', {
    name: 'Related post',
    exact: true,
  })
  await expect(related).toHaveValue('hello.md', { timeout: 45_000 })
  await page.waitForLoadState('networkidle')
  await related.click()
  await expect(
    page.getByRole('option', { name: 'unchanged.md', exact: true }),
  ).toBeVisible()
  await related.press('Escape')
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Hello world', exact: true }),
  ).toBeVisible()
  const requests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/files')
      requests.push(request.url())
  })
  await page
    .getByRole('link', { name: 'Selection controls', exact: true })
    .click()
  await expect(related).toHaveValue('hello.md')
  await related.click()
  await expect(
    page.getByRole('option', { name: 'unchanged.md', exact: true }),
  ).toBeVisible()
  expect(requests).toEqual([])
})

test('a saved edit invalidates its already-loaded history', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/merge-review')
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await expect(title).toHaveValue('Original title', { timeout: 45_000 })
  await page.waitForLoadState('networkidle')
  const firstRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/entries/history',
  )
  await page.getByRole('button', { name: 'Entry history', exact: true }).click()
  const historyPath = new URL((await firstRequest).url()).pathname
  await expect(
    page.getByRole('menu').getByText('No history found.', { exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await title.fill('New saved title')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  const nextRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === historyPath,
  )
  await page.getByRole('button', { name: 'Entry history', exact: true }).click()
  await nextRequest
  await expect(
    page.getByRole('menu').getByText('No history found.', { exact: true }),
  ).toBeVisible()
})

test('Overview receives another tab’s draft even without first opening an editor', async ({
  page,
  context,
}) => {
  await page.goto('/github/pagescms/fixture/main')
  await expect(
    page.getByText('No drafts saved on this device.', { exact: true }),
  ).toBeVisible({ timeout: 45_000 })
  await page.waitForLoadState('networkidle')
  const second = await context.newPage()
  await second.goto(
    '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  const title = second.getByRole('textbox', { name: 'Title', exact: true })
  await expect(title).toHaveValue('Hello world')
  await second.waitForLoadState('networkidle')
  await title.fill('Draft created in another tab')
  await expect(
    page
      .getByRole('list', { name: 'Local drafts', exact: true })
      .getByRole('link', { name: 'Draft created in another tab', exact: true }),
  ).toBeVisible()
})

test('editing a referenced entry refreshes its cached display label', async ({
  page,
}) => {
  const { configuration } = await import('./github-fixture.server')
  const marker =
    '      - name: related\n        label: Related post\n        type: reference\n        options:\n          collection: posts'
  const source = configuration.replace(
    marker,
    `${marker}\n          label: '{primary}'`,
  )
  expect(source).not.toBe(configuration)
  await page.goto('/github/pagescms/fixture/main/configuration')
  const editor = page.getByRole('textbox', {
    name: 'Configuration',
    exact: true,
  })
  await expect(editor).toBeEnabled({ timeout: 45_000 })
  await page.waitForLoadState('networkidle')
  await editor.fill(source)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('Configuration saved', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Selection controls', exact: true })
    .click()
  const related = page.getByRole('combobox', {
    name: 'Related post',
    exact: true,
  })
  await expect(related).toHaveValue('Hello world')
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await page.getByRole('link', { name: 'Hello world', exact: true }).click()
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await expect(title).toHaveValue('Hello world')
  await title.fill('Updated reference label')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page
    .getByRole('link', { name: 'Selection controls', exact: true })
    .click()
  await expect(related).toHaveValue('Updated reference label')
})
