import { expect, test } from './test'

const entry =
  '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
const overview = '/github/pagescms/fixture/main'
test.setTimeout(60_000)

test('overview offers collection creation and fixed-file editing', async ({
  page,
}) => {
  await page.goto(overview)
  const shortcuts = page.getByRole('region', { name: 'Quick links' })
  await expect(
    shortcuts.getByRole('link', { name: 'Add Posts', exact: true }),
  ).toHaveAttribute(
    'href',
    '/github/pagescms/fixture/main/collection/posts/new',
  )
  await expect(
    shortcuts.getByRole('link', { name: 'Edit Groups', exact: true }),
  ).toHaveAttribute('href', '/github/pagescms/fixture/main/file/groups')
  await expect(
    shortcuts
      .getByRole('link', { name: 'Add Posts', exact: true })
      .locator('svg[data-icon="inline-start"]'),
  ).toBeVisible()
  await expect(
    shortcuts
      .getByRole('link', { name: 'Edit Groups', exact: true })
      .locator('svg[data-icon="inline-start"]'),
  ).toBeVisible()
  await expect(
    shortcuts.getByRole('link', { name: 'Edit Groups', exact: true }),
  ).toHaveText('Groups')
  await expect(
    shortcuts.getByRole('button', { name: 'Upload Media' }),
  ).toBeEnabled()
  await expect(
    shortcuts.getByRole('button', { name: 'Run Deploy site', exact: true }),
  ).toBeVisible()
  await shortcuts
    .getByRole('link', { name: 'Edit Groups', exact: true })
    .click()
  await expect(page).toHaveURL(/\/file\/groups$/)
})

test('overview upload shortcut opens the file picker and uploads without leaving Overview', async ({
  page,
}) => {
  await page.goto(overview)
  const upload = page
    .getByRole('region', { name: 'Quick links' })
    .getByRole('button', { name: 'Upload Media', exact: true })
  const chooserEvent = page.waitForEvent('filechooser', { timeout: 15_000 })
  await upload.click()
  const cancelled = await chooserEvent
  expect(cancelled.isMultiple()).toBe(true)
  await cancelled.setFiles([])
  await expect(upload).toBeEnabled()
  await expect(page).toHaveURL(overview)
  const selected = page.waitForEvent('filechooser', { timeout: 15_000 })
  await upload.click()
  const chooser = await selected
  await chooser.setFiles([
    {
      name: 'overview-upload.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    },
    {
      name: 'overview-second.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    },
  ])
  await expect(
    page.getByText('2 files uploaded', { exact: true }),
  ).toBeVisible()
  await expect(upload).toBeEnabled()
  await expect(page).toHaveURL(overview)
  await expect(
    page.getByRole('region', { name: 'Activity', exact: true }),
  ).toContainText('uploaded overview-upload.svg to Media')
  await page.getByRole('link', { name: 'Media', exact: true }).click()
  await expect(
    page.getByText('overview-upload.svg', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('overview-second.svg', { exact: true }),
  ).toBeVisible()
})

test('overview upload keeps completed files after a batch validation failure and can retry', async ({
  page,
}) => {
  await page.goto(overview)
  const upload = page
    .getByRole('region', { name: 'Quick links' })
    .getByRole('button', { name: 'Upload Media', exact: true })
  const choose = page.waitForEvent('filechooser', { timeout: 15_000 })
  await upload.click()
  const chooser = await choose
  await chooser.setFiles([
    {
      name: 'overview-kept.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    },
    {
      name: 'overview-too-large.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
    },
  ])
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '20 MB limit' }),
  ).toBeVisible()
  await expect(upload).toBeEnabled()
  await expect(page).toHaveURL(overview)
  await expect(
    page.getByRole('region', { name: 'Activity', exact: true }),
  ).toContainText('uploaded overview-kept.svg to Media')
  const retry = page.waitForEvent('filechooser', { timeout: 15_000 })
  await upload.click()
  await (
    await retry
  ).setFiles({
    name: 'overview-retry.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  })
  await expect(page.getByText('1 file uploaded', { exact: true })).toBeVisible()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '20 MB limit' }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Media', exact: true }).click()
  await expect(
    page.getByText('overview-kept.svg', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('overview-retry.svg', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('overview-too-large.svg', { exact: true }),
  ).toHaveCount(0)
})

test('visit pruning retains 50 per scope, reveals five at a time, and does not prune drafts or other scopes', async ({
  page,
}) => {
  await page.goto(entry)
  await expect(
    page.getByRole('textbox', { name: 'Title', exact: true }),
  ).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('pagescms-local-files')
            request.onsuccess = () => {
              const count = request.result
                .transaction('recent')
                .objectStore('recent')
                .count()
              count.onsuccess = () => resolve(count.result)
              count.onerror = () => reject(count.error)
            }
          }),
      ),
    )
    .toBeGreaterThan(0)
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pagescms-local-files')
        request.onsuccess = () => {
          const transaction = request.result.transaction(
            ['recent', 'drafts'],
            'readwrite',
          )
          const store = transaction.objectStore('recent')
          const existing = store.getAll()
          existing.onsuccess = () => {
            const sample = existing.result[0]
            const now = Date.now() - 100_000
            for (let i = 0; i < 60; i++)
              store.put({
                ...sample,
                key: `visit-${i}`,
                title: `Visit ${i}`,
                updatedAt: now + i,
              })
            for (const [key, changes] of [
              ['other-provider', { source: 'other-forge' }],
              ['other-account', { account: 'other-account' }],
              [
                'other-owner',
                {
                  target: {
                    ...sample.target,
                    owner: 'another-owner',
                    repoId: '2',
                  },
                },
              ],
              [
                'other-repo',
                {
                  target: {
                    ...sample.target,
                    repo: 'another-repo',
                    repoId: '3',
                  },
                },
              ],
              [
                'other-branch',
                { target: { ...sample.target, branch: 'another-branch' } },
              ],
            ] as const)
              store.put({
                ...sample,
                ...changes,
                key,
                updatedAt: Date.now() + 100_000,
              })
            transaction.objectStore('drafts').put({
              key: 'protected-draft',
              revision: 1,
              schema: '',
              baseSha: null,
              base: { value: {} },
              value: { title: 'Protected draft' },
            })
          }
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
        }
      }),
  )
  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('pagescms-local-files')
            request.onsuccess = () => {
              const count = request.result
                .transaction('recent')
                .objectStore('recent')
                .count()
              count.onsuccess = () => resolve(count.result)
              count.onerror = () => reject(count.error)
            }
          }),
      ),
    )
    .toBe(55)
  const keys = await page.evaluate(
    () =>
      new Promise<{ recent: IDBValidKey[]; drafts: IDBValidKey[] }>(
        (resolve, reject) => {
          const request = indexedDB.open('pagescms-local-files')
          request.onsuccess = () => {
            const transaction = request.result.transaction(['recent', 'drafts'])
            const recent = transaction.objectStore('recent').getAllKeys()
            const drafts = transaction.objectStore('drafts').getAllKeys()
            transaction.oncomplete = () =>
              resolve({ recent: recent.result, drafts: drafts.result })
            transaction.onerror = () => reject(transaction.error)
          }
        },
      ),
  )
  expect(keys.recent).not.toContain('visit-0')
  expect(keys.recent).toContain('visit-59')
  expect(keys.drafts).toContain('protected-draft')
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  const recent = page.getByRole('list', { name: 'Recently visited' })
  await expect(recent.getByRole('listitem')).toHaveCount(5)
  await expect(
    page.getByRole('list', { name: 'Recently visited' }),
  ).not.toContainText('Visit 0')
  const more = page.getByRole('button', {
    name: 'Show more recently visited entries',
  })
  for (let count = 10; count <= 50; count += 5) {
    await more.click()
    await expect(recent.getByRole('listitem')).toHaveCount(count)
  }
  await expect(more).toHaveCount(0)
})

test('drafts reveal five at a time without limiting retained drafts', async ({
  page,
}) => {
  await page.goto(entry)
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Draft 0')
  await expect(
    page.getByRole('button', { name: /^Local draft:/ }),
  ).toBeVisible()
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pagescms-local-files')
        request.onsuccess = () => {
          const transaction = request.result.transaction(
            ['drafts', 'summaries'],
            'readwrite',
          )
          const store = transaction.objectStore('drafts')
          const existing = store.getAll()
          existing.onsuccess = () => {
            const sample = existing.result[0]
            for (let index = 1; index < 12; index++) {
              const key = `draft-${index}`
              const summary = {
                ...sample.summary,
                key,
                title: `Draft ${index}`,
                updatedAt: Date.now() - index,
              }
              store.put({ ...sample, key, summary })
              transaction.objectStore('summaries').put(summary)
            }
          }
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
        }
      }),
  )
  await page.goto(overview)

  const drafts = page.getByRole('list', { name: 'Local drafts' })
  await expect(drafts.getByRole('listitem')).toHaveCount(5)
  const more = page.getByRole('button', { name: 'Show more drafts' })
  await more.click()
  await expect(drafts.getByRole('listitem')).toHaveCount(10)
  await more.click()
  await expect(drafts.getByRole('listitem')).toHaveCount(12)
  await expect(more).toHaveCount(0)
  await page.reload()

  await expect(drafts.getByRole('listitem')).toHaveCount(5)
  await expect(more).toBeVisible()
})

test('overview shows list skeletons until local storage has finished loading', async ({
  page,
  context,
}) => {
  await page.goto(entry)
  await expect(
    page.getByRole('textbox', { name: 'Title', exact: true }),
  ).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pagescms-local-files')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction(
            ['drafts', 'recent'],
            'readwrite',
          )
          let held = true
          ;(
            window as Window & { releaseOverviewStorage?: () => void }
          ).releaseOverviewStorage = () => {
            held = false
          }
          const keepOpen = () => {
            const read = transaction
              .objectStore('drafts')
              .get('overview-loading-test')
            read.onsuccess = () => {
              if (held) keepOpen()
            }
          }
          transaction.oncomplete = () => database.close()
          keepOpen()
          resolve()
        }
      }),
  )
  const overviewPage = await context.newPage()
  try {
    await overviewPage.goto(overview)
    for (const name of ['Loading drafts', 'Loading recently visited entries']) {
      const skeleton = overviewPage.getByRole('list', { name, exact: true })
      await expect(skeleton).toBeVisible()
      await expect(skeleton).toHaveAttribute('aria-busy', 'true')
      await expect(skeleton).toHaveCSS('border-top-width', '1px')
      await expect(
        skeleton.getByRole('listitem', { includeHidden: true }),
      ).toHaveCount(5)
      await expect(skeleton.locator('button, a')).toHaveCount(0)
    }
    await expect(
      overviewPage.getByText('No drafts saved on this device.'),
    ).toHaveCount(0)
    await expect(
      overviewPage.getByText('Entries you visit will appear here.'),
    ).toHaveCount(0)
  } finally {
    await page.evaluate(() =>
      (
        window as Window & { releaseOverviewStorage?: () => void }
      ).releaseOverviewStorage?.(),
    )
  }
  await expect(
    overviewPage.getByRole('list', { name: 'Loading drafts', exact: true }),
  ).toHaveCount(0)
  await expect(
    overviewPage.getByText('No drafts saved on this device.'),
  ).toBeVisible()
  await expect(
    overviewPage.getByRole('list', { name: 'Recently visited', exact: true }),
  ).toBeVisible()
})

for (const width of [375, 1280]) {
  test(`overview rows stay compact and drafts remain recoverable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(entry)
    const title = 'A long draft title with nested content and a filename '
      .repeat(3)
      .trim()
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title)
    await expect(
      page.getByRole('button', { name: /^Local draft:/ }),
    ).toBeVisible()
    await page.goto(overview)
    const recent = page.getByRole('list', { name: 'Recently visited' })
    await expect(
      page.getByRole('heading', { name: 'Drafts', exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await expect(recent.getByRole('button')).toHaveCount(0)
    await expect(
      recent.getByRole('link', { name: 'Hello world', exact: true }),
    ).toBeVisible()
    await expect(recent.getByText('Draft', { exact: true })).toHaveCount(0)

    const drafts = page.getByRole('list', { name: 'Local drafts' })
    const row = drafts.getByRole('listitem')
    const link = row.getByRole('link', { name: title, exact: true })
    await expect(link).toBeVisible()
    await expect(row.getByRole('link')).toHaveCount(1)
    await expect(row.getByRole('button')).toHaveCount(0)
    await expect(row.getByRole('menuitem')).toHaveCount(0)
    const titleText = link.locator('[data-slot=overview-entry-title]')
    expect(
      await titleText.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      ),
    ).toBe(true)
    const rowBox = await row.boundingBox()
    const timeBox = await row.locator('time').boundingBox()
    const titleBox = await link.boundingBox()
    expect(timeBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width)
    expect(
      Math.abs(
        timeBox!.y + timeBox!.height / 2 - titleBox!.y - titleBox!.height / 2,
      ),
    ).toBeLessThan(1)
    expect(rowBox!.width).toBeGreaterThan(0)
    await row.locator('time').focus()
    await expect(page.getByRole('tooltip')).toContainText('Draft saved')
    await page.keyboard.press('Escape')
    await link.blur()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await link.click()
    await expect(
      page.getByRole('textbox', { name: 'Title', exact: true }),
    ).toHaveValue(title)
    await page.getByRole('button', { name: /^Local draft:/ }).click()
    await page
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    const confirmation = page.getByRole('alertdialog')
    await expect(confirmation).toBeVisible()
    await confirmation
      .getByRole('button', { name: 'Cancel', exact: true })
      .click()
    await expect(
      page.getByRole('textbox', { name: 'Title', exact: true }),
    ).toHaveValue(title)
    await page
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    await confirmation
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    await expect(confirmation).toBeHidden()
    await page.goto(overview)
    await expect(
      page.getByText('No drafts saved on this device.'),
    ).toBeVisible()
    await expect(recent).toBeVisible()
    await expect(recent.getByText('Draft', { exact: true })).toHaveCount(0)
  })
}
