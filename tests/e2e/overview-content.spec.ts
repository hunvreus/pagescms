import { expect, test } from './test'

const overview = '/github/pagescms/fixture/main'
const entry = `${overview}/collection/posts/entry/content/posts/hello.md`

test('recent visits contain content while configuration drafts remain recoverable', async ({
  page,
}) => {
  await page.goto(entry)
  await expect(
    page.getByRole('textbox', { name: 'Title', exact: true }),
  ).toHaveValue('Hello world')
  await page.getByRole('link', { name: 'Configuration', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Configuration' })
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.press('ControlOrMeta+Home')
  await page.keyboard.insertText('# Unsaved configuration draft\n')
  await expect(
    page.getByRole('button', { name: /^Local draft:/ }),
  ).toBeVisible()
  await page.goto(overview)
  const recent = page.getByRole('list', {
    name: 'Recently visited',
    exact: true,
  })
  await expect(
    recent.getByRole('link', { name: 'Hello world', exact: true }),
  ).toBeVisible()
  await expect(
    recent.getByRole('link', { name: 'Configuration', exact: true }),
  ).toHaveCount(0)
  const configurations = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('pagescms-local-files')
        request.onsuccess = () => {
          const all = request.result
            .transaction('recent')
            .objectStore('recent')
            .getAll()
          all.onsuccess = () =>
            resolve(
              all.result.filter(
                (value: { target: { kind?: string } }) =>
                  value.target.kind === 'configuration',
              ).length,
            )
          all.onerror = () => reject(all.error)
        }
        request.onerror = () => reject(request.error)
      }),
  )
  expect(configurations).toBe(0)
  await page
    .getByRole('list', { name: 'Local drafts', exact: true })
    .getByRole('link', { name: 'Configuration', exact: true })
    .click()
  await expect(editor).toContainText('# Unsaved configuration draft')
})

test('recent entries retain readable context for deep paths and narrow screens', async ({
  page,
}) => {
  await page.goto(entry)
  await expect(
    page.getByRole('textbox', { name: 'Title', exact: true }),
  ).toHaveValue('Hello world')
  await page.goto(overview)
  await expect(
    page.getByRole('list', { name: 'Recently visited', exact: true }),
  ).toBeVisible()
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('pagescms-local-files')
        request.onsuccess = () => {
          const tx = request.result.transaction('recent', 'readwrite')
          const store = tx.objectStore('recent')
          const all = store.getAll()
          all.onsuccess = () => {
            const sample = all.result[0]
            store.put({
              ...sample,
              key: 'nested-content',
              title: 'A nested entry title that stays readable',
              updatedAt: Date.now(),
              target: {
                ...sample.target,
                path: 'content/posts/2026/campaigns/autumn/entry.md',
              },
            })
          }
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
        request.onerror = () => reject(request.error)
      }),
  )
  await page.reload()
  const row = page
    .getByRole('list', { name: 'Recently visited', exact: true })
    .getByRole('listitem')
    .filter({ hasText: 'A nested entry title' })
  const context = row.locator('[data-overview-parent]')
  await expect(context).toBeVisible()
  await expect(context).toContainText('Posts › … › autumn')
  const link = row.getByRole('link', {
    name: 'A nested entry title that stays readable',
    exact: true,
  })
  const rootBadge = page
    .getByRole('list', { name: 'Recently visited', exact: true })
    .getByRole('listitem')
    .filter({ hasText: 'Hello world' })
    .locator('[data-overview-parent]')
  await expect(rootBadge).toHaveText('Posts')
  await expect(context).not.toHaveAttribute('tabindex')
  await expect(context).not.toHaveAttribute('title')
  await context.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await link.focus()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await link.hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  await row.locator('time').focus()
  await expect(page.getByRole('tooltip')).toContainText('Visited')
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 375, height: 844 })
  await expect(context).toBeHidden()
  await expect(link).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('Overview reads only summaries for the current project', async ({
  page,
}) => {
  await page.goto(entry)
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Current draft')
  await expect(
    page.getByRole('button', { name: /^Local draft:/ }),
  ).toBeVisible()
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('pagescms-local-files')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction('summaries', 'readwrite')
          const store = tx.objectStore('summaries')
          const read = store.openCursor()
          read.onsuccess = () => {
            const summary = read.result!.value
            store.put({ ...summary, key: 'other account', account: 'other' })
            store.put({ ...summary, key: 'other source', source: 'other' })
            store.put({
              ...summary,
              key: 'other repository',
              target: { ...summary.target, repoId: '2' },
            })
            store.put({
              ...summary,
              key: 'other branch',
              target: { ...summary.target, branch: 'other' },
            })
          }
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
  await page.addInitScript(() => {
    const getAll = IDBObjectStore.prototype.getAll
    IDBObjectStore.prototype.getAll = function (...args) {
      if (['drafts', 'summaries', 'recent'].includes(this.name))
        throw new Error('Overview performed an unscoped read')
      return getAll.apply(this, args)
    }
  })
  await page.goto(overview)
  const drafts = page.getByRole('list', { name: 'Local drafts' })
  await expect(
    drafts.getByRole('link', { name: 'Current draft', exact: true }),
  ).toBeVisible()
  await expect(drafts.getByRole('listitem')).toHaveCount(1)
})
