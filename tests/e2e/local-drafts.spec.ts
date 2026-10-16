import { expect, test } from './test'
import type { Page } from '@playwright/test'

const entry =
  '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
test.setTimeout(60_000)

async function expectDraft(page: Page, text: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>((resolve, reject) => {
            const request = indexedDB.open('pagescms-content-drafts')
            request.onsuccess = () => {
              const read = request.result
                .transaction('drafts')
                .objectStore('drafts')
                .getAll()
              read.onsuccess = () => {
                request.result.close()
                resolve(JSON.stringify(read.result.map((draft) => draft.value)))
              }
              read.onerror = () => reject(read.error)
            }
            request.onerror = () => reject(request.error)
          }),
      ),
    )
    .toContain(text)
}

for (const width of [1280, 390]) {
  test(`discarding an editor draft requires confirmation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(entry)
    await page.waitForLoadState('networkidle')
    const title = page.getByRole('textbox', { name: 'Title', exact: true })
    const original = await title.inputValue()
    await title.fill('Keep this until I confirm discard')
    await expectDraft(page, 'Keep this until I confirm discard')

    await page.getByRole('button', { name: /^Local draft:/ }).click()
    await page
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    const confirmation = page.getByRole('alertdialog', {
      name: 'Discard local draft?',
    })
    await expect(confirmation).toBeVisible()
    await expectDraft(page, 'Keep this until I confirm discard')
    await page.screenshot({
      path: test.info().outputPath('discard-confirmation.png'),
    })
    await confirmation
      .getByRole('button', { name: 'Cancel', exact: true })
      .click()
    await expect(confirmation).not.toBeVisible()
    await expect(title).toHaveValue('Keep this until I confirm discard')
    await expectDraft(page, 'Keep this until I confirm discard')

    await page
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    await confirmation
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    await expect(confirmation).not.toBeVisible()
    await expect(title).toHaveValue(original)
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await page.reload()
    await expect(title).toHaveValue(original)
  })
}

test('structured drafts survive reload and successful file saves clear them', async ({
  page,
}) => {
  await page.goto(entry)
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByText('Loading local draft…', { exact: true }),
  ).toHaveCount(0)
  await title.fill('Local recovered title')
  await expectDraft(page, 'Local recovered title')
  await expect(
    page.getByRole('img', { name: 'Unsaved changes', exact: true }),
  ).toHaveCount(0)
  await page.screenshot({
    path: test.info().outputPath('local-draft-status.png'),
  })
  await page.reload()
  await expect(title).toHaveValue('Local recovered title')
  await expectDraft(page, 'Local recovered title')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('pagescms-content-drafts')
            request.onsuccess = () => {
              const count = request.result
                .transaction('drafts')
                .objectStore('drafts')
                .count()
              count.onsuccess = () => resolve(count.result)
              count.onerror = () => reject(count.error)
            }
          }),
      ),
    )
    .toBe(0)
  await page.reload()
  await expect(title).toHaveValue('Local recovered title')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
})

test('failed saves keep recoverable content and retry through the original file save', async ({
  page,
}) => {
  await page.goto(entry)
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await page.waitForLoadState('networkidle')
  await title.fill('Keep this after failure')
  await expectDraft(page, 'Keep this after failure')
  await page.route('**/*', async (route) => {
    if (route.request().method() === 'POST') await route.abort('failed')
    else await route.continue()
  })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled()
  await page.unroute('**/*')
  await page.reload()
  await expect(title).toHaveValue('Keep this after failure')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
})

test('new-entry drafts restore before creation', async ({ page }) => {
  await page.goto('/pagescms/fixture/main/collection/posts/new')
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await page.waitForLoadState('networkidle')
  await title.fill('Draft before creation')
  await expectDraft(page, 'Draft before creation')
  await page.reload()
  await expect(title).toHaveValue('Draft before creation')
  await page.getByRole('button', { name: 'Create entry', exact: true }).click()
  await expect(page).toHaveURL(/\/entry\//)
  await expect(title).toHaveValue('Draft before creation')
})

test('another tab cannot silently overwrite a newer local draft', async ({
  page,
  context,
}) => {
  await page.goto(entry)
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await page.waitForLoadState('networkidle')
  await title.fill('First revision')
  await expectDraft(page, 'First revision')
  const second = await context.newPage()
  await second.goto(entry)
  const secondTitle = second.getByRole('textbox', {
    name: 'Title',
    exact: true,
  })
  await expect(secondTitle).toHaveValue('First revision')
  await secondTitle.fill('Newer revision in second tab')
  await expectDraft(second, 'Newer revision in second tab')
  await page.waitForLoadState('networkidle')
  await title.fill('Stale tab revision')
  await expect(
    page.getByText('Could not save locally — keep this tab open', {
      exact: true,
    }),
  ).toBeVisible()
  await page.reload()
  await expect(title).toHaveValue('Newer revision in second tab')
})

test('raw content drafts survive reload', async ({ page }) => {
  await page.goto('/pagescms/fixture/main/file/raw-code')
  await page.waitForLoadState('networkidle')
  const source = page.getByRole('textbox', {
    name: 'Entry source',
    exact: true,
  })
  await source.fill('const draftValue = 42;')
  await expectDraft(page, 'const draftValue = 42;')
  await page.reload()
  await expect(source).toHaveText('const draftValue = 42;')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
})

test('restored drafts require review before replacing a remotely changed field', async ({
  page,
  browser,
  context,
  isolation,
}) => {
  await page.goto(entry)
  await page.waitForLoadState('networkidle')
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await title.fill('My local unsaved edit')
  await expectDraft(page, 'My local unsaved edit')
  const otherContext = await browser.newContext({
    storageState: await context.storageState(),
    extraHTTPHeaders: { 'x-pagescms-e2e-scope': isolation.scope },
  })
  try {
    const other = await otherContext.newPage()
    await other.goto(new URL(entry, page.url()).href)
    await other.waitForLoadState('networkidle')
    const otherTitle = other.getByRole('textbox', {
      name: 'Title',
      exact: true,
    })
    await otherTitle.fill('Other editor published this')
    await other.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(other.getByText('File saved', { exact: true })).toBeVisible()
    await page.reload()
    await expect(title).toHaveValue('My local unsaved edit')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const review = page.getByRole('dialog', {
      name: /Some changes need your review|Your changes are ready to combine|Choose which version to keep/,
    })
    await expect(review).toBeVisible()
    await expect(
      review.getByRole('region', { name: 'Title', exact: true }),
    ).toBeVisible()
    await expect(
      review.getByRole('button', { name: 'Save changes' }),
    ).toBeDisabled()
    await review.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(title).toHaveValue('My local unsaved edit')
    await other.reload()
    await expect(otherTitle).toHaveValue('Other editor published this')
  } finally {
    await otherContext.close()
  }
})

test('undoing all edits clears the obsolete local draft', async ({ page }) => {
  await page.goto(entry)
  await page.waitForLoadState('networkidle')
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  const original = await title.inputValue()
  await title.fill('An abandoned local edit')
  await expectDraft(page, 'An abandoned local edit')
  await title.fill(original)
  // Wait for the debounced storage cleanup before reloading.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const request = indexedDB.open('pagescms-content-drafts')
            request.onsuccess = () => {
              const count = request.result
                .transaction('drafts')
                .objectStore('drafts')
                .count()
              count.onsuccess = () => resolve(count.result)
              count.onerror = () => reject(count.error)
            }
          }),
      ),
    )
    .toBe(0)
  await page.reload()
  await expect(title).toHaveValue(original)
})

test('a draft based on a missing file cannot overwrite a file that appeared later', async ({
  page,
}) => {
  await page.goto(entry)
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await title.fill('Draft from before the file existed')
  await expectDraft(page, 'Draft from before the file existed')
  // Model a previously saved local draft from the missing-file editor.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pagescms-content-drafts')
        request.onsuccess = () => {
          const transaction = request.result.transaction('drafts', 'readwrite')
          const store = transaction.objectStore('drafts')
          const all = store.getAll()
          all.onsuccess = () => store.put({ ...all.result[0], baseSha: null })
          transaction.oncomplete = () => {
            request.result.close()
            resolve()
          }
          transaction.onabort = () => reject(transaction.error)
        }
        request.onerror = () => reject(request.error)
      }),
  )
  await page.reload()
  await expect(title).toHaveValue('Draft from before the file existed')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  // With no original SHA, a collection entry is a create. A collision must
  // remain a failure, rather than silently turning creation into an update.
  await expect(
    page.getByText('File changed since this edit was opened', { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await page
    .getByRole('table', { name: 'Local drafts' })
    .getByRole('button', { name: 'Discard', exact: true })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click()
  await page.goto(entry)
  await expect(title).toHaveValue('Hello world')
})
