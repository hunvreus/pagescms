import { readFile } from 'node:fs/promises'
import { expect, test } from './test'

const entry =
  '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
const badgeName = /^Local draft:/
test.setTimeout(60_000)

for (const width of [320, 390, 1280]) {
  test(`draft recovery stays in its badge popover at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(entry)
    const title = page.getByRole('textbox', { name: 'Title', exact: true })
    await expect(title).toHaveValue('Hello world')
    const before = await title.boundingBox()
    await title.fill('Preserve this original draft')
    const badge = page.getByRole('button', { name: badgeName })
    await expect(badge).toHaveText('Draft')
    await expect(badge).toHaveAttribute('data-variant', 'secondary')
    const heading = page.locator('[data-slot="breadcrumb-page"]')
    const headingBox = (await heading.boundingBox())!
    const badgeBox = (await badge.boundingBox())!
    expect(badgeBox.x - headingBox.x - headingBox.width).toBeGreaterThanOrEqual(
      0,
    )
    expect(
      Math.abs(
        badgeBox.y + badgeBox.height / 2 - headingBox.y - headingBox.height / 2,
      ),
    ).toBeLessThan(2)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const after = await title.boundingBox()
    expect(after!.y).toBe(before!.y)
    await badge.click()
    const normal = page.getByRole('dialog', {
      name: 'Local draft',
      exact: true,
    })
    await expect(normal).toContainText('Last saved in this browser')
    await expect(
      normal.getByRole('button', { name: 'Download draft' }),
    ).toBeEnabled()
    await page.keyboard.press('Escape')
    const original = await page.evaluate(
      () =>
        new Promise<{ schema: string; value: unknown }>((resolve, reject) => {
          const request = indexedDB.open('pagescms-local-files')
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction('drafts', 'readwrite')
            const store = tx.objectStore('drafts')
            const all = store.getAll()
            let draft: { schema: string; value: unknown }
            all.onsuccess = () => {
              draft = all.result[0]
              draft.schema = JSON.stringify([
                {
                  name: 'title',
                  type: 'string',
                  label: 'Previous title label',
                },
              ])
              store.put(draft)
            }
            tx.oncomplete = () => {
              db.close()
              resolve(draft)
            }
            tx.onerror = () => reject(tx.error)
          }
        }),
    )
    await page.reload()
    await expect(badge).toHaveAttribute('data-variant', 'destructive')
    await expect(badge).toBeEnabled()
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    const recovery = page.getByRole('dialog', {
      name: 'Local draft',
      exact: true,
    })
    await expect(recovery).toContainText('The content configuration changed')
    const box = await recovery.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(15.5)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width - 15.5)
    const download = page.waitForEvent('download')
    await recovery
      .getByRole('button', { name: 'Download draft', exact: true })
      .click()
    const path = await (await download).path()
    const backup = JSON.parse(await readFile(path, 'utf8'))
    expect(backup.schema).toBe(original.schema)
    expect(backup.value).toEqual(original.value)
    await recovery
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    const confirmation = page.getByRole('alertdialog', {
      name: 'Discard local draft?',
    })
    await confirmation
      .getByRole('button', { name: 'Cancel', exact: true })
      .click()
    await expect(recovery).toBeVisible()
    await recovery
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    await confirmation
      .getByRole('button', { name: 'Discard draft', exact: true })
      .click()
    await expect(badge).toHaveCount(0)
    await expect(title).toHaveValue('Hello world')
    await page.reload()
    await expect(title).toHaveValue('Hello world')
    await expect(badge).toHaveCount(0)
  })
}

test('unreadable browser storage shows an actionable error badge without exporting unrelated content', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const get = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.get = function (key) {
      if (this.name === 'drafts')
        throw new DOMException('Draft storage unavailable', 'SecurityError')
      return get.call(this, key)
    }
  })
  await page.goto(entry)
  const badge = page.getByRole('button', { name: badgeName })
  await expect(badge).toHaveText('Draft')
  await expect(badge).toHaveAttribute('data-variant', 'destructive')
  await expect(badge).toBeEnabled()
  const recovery = page.getByRole('dialog', {
    name: 'Local draft',
    exact: true,
  })
  await expect(recovery).toContainText('Draft storage unavailable')
  await expect(
    recovery.getByRole('button', { name: 'Download draft' }),
  ).toBeDisabled()
  await expect(
    recovery.getByRole('button', { name: 'Discard draft' }),
  ).toBeEnabled()
  await recovery.getByRole('button', { name: 'Discard draft' }).click()
  const confirmation = page.getByRole('alertdialog', {
    name: 'Discard local draft?',
  })
  await confirmation
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click()
  await expect(confirmation).toBeVisible()
  await expect(
    page.locator('[data-sonner-toast]').filter({
      hasText: /Draft storage unavailable|Could not discard this draft/,
    }),
  ).toBeVisible()
  await expect(
    confirmation.getByRole('button', { name: 'Discard draft', exact: true }),
  ).toBeEnabled()
})
