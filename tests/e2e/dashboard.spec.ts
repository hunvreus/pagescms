import { expect, test } from './test'

const entry =
  '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
const overview = '/pagescms/fixture/main'
test.setTimeout(60_000)

test('overview offers collection creation and fixed-file editing', async ({
  page,
}) => {
  await page.goto(overview)
  const shortcuts = page.getByRole('table', { name: 'Content shortcuts' })
  await expect(shortcuts.getByRole('link', { name: /Posts/ })).toHaveAttribute(
    'href',
    '/pagescms/fixture/main/collection/posts/new',
  )
  await expect(shortcuts.getByRole('link', { name: /Groups/ })).toHaveAttribute(
    'href',
    '/pagescms/fixture/main/file/groups',
  )
  await expect(
    shortcuts
      .getByRole('link', { name: /Posts/ })
      .locator('svg rect[x="10"][y="6"]'),
  ).toBeVisible()
  await expect(
    shortcuts
      .getByRole('link', { name: /Groups/ })
      .locator('svg.lucide-file-text'),
  ).toBeVisible()
  await shortcuts.getByRole('link', { name: /Groups/ }).click()
  await expect(page).toHaveURL(/\/file\/groups$/)
})

test('visit pruning retains 50 per scope, displays ten, and does not prune drafts or other scopes', async ({
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
            const request = indexedDB.open('pagescms-content-drafts')
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
        const request = indexedDB.open('pagescms-content-drafts')
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
                { target: { ...sample.target, owner: 'another-owner' } },
              ],
              [
                'other-repo',
                { target: { ...sample.target, repo: 'another-repo' } },
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
            const request = indexedDB.open('pagescms-content-drafts')
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
          const request = indexedDB.open('pagescms-content-drafts')
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
  await page.goto(overview)
  await expect(
    page.getByRole('table', { name: 'Recently opened' }).getByRole('row'),
  ).toHaveCount(10)
  await expect(
    page.getByRole('table', { name: 'Recently opened' }),
  ).not.toContainText('Visit 0')
})
