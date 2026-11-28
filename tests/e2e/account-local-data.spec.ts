import type { Page } from '@playwright/test'
import { createClient } from '@libsql/client'
import { createLibSqlDatabase } from '#/server/db/client'
import { deleteAccountData } from '#/server/account/deletion'
import { expect, test } from './test'

async function seedLocalData(
  page: Page,
  draftPath = 'content/posts/local-data-fixture.md',
) {
  await page.goto('/github/pagescms/fixture/main')
  await expect(
    page.getByText('No drafts saved on this device.', { exact: true }),
  ).toBeVisible()
  await page.goto('/settings')
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem('pagescms:local-accounts')),
    )
    .toContain('playwright-user')
  await page.evaluate(async (storedPath) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('pagescms-local-files')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        ['drafts', 'recent', 'summaries'],
        'readwrite',
      )
      for (const account of ['playwright-user', 'other-account']) {
        const key = JSON.stringify([
          account,
          'github.com',
          '1',
          'main',
          'posts',
          storedPath,
          null,
        ])
        const summary = {
          key,
          account,
          source: 'github.com',
          target: {
            repoId: '1',
            owner: 'pagescms',
            repo: 'fixture',
            branch: 'main',
            name: 'posts',
            path: storedPath,
          },
          title: account,
          href: '/',
          updatedAt: Date.now(),
        }
        transaction.objectStore('drafts').put({
          key,
          summary,
          value: { title: account },
          revision: 1,
          schema: '{}',
          baseSha: null,
          base: { value: {} },
        })
        transaction.objectStore('summaries').put(summary)
        transaction.objectStore('recent').put(summary)
        localStorage.setItem(
          `latestVisits:${account}`,
          JSON.stringify([
            {
              owner: 'pagescms',
              repo: 'fixture',
              repoId: '1',
              source: 'github.com',
              branch: 'main',
              timestamp: 1,
            },
          ]),
        )
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  }, draftPath)
}

async function localOwners(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('pagescms-local-files')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await Promise.all(
        ['drafts', 'recent'].map(
          (name) =>
            new Promise<string[]>((resolve, reject) => {
              const request = db.transaction(name).objectStore(name).getAll()
              request.onsuccess = () =>
                resolve(
                  request.result
                    .map((value) => value.summary?.account ?? value.account)
                    .sort(),
                )
              request.onerror = () => reject(request.error)
            }),
        ),
      )
    } finally {
      db.close()
    }
  })
}

test('ordinary sign-out preserves local drafts and visits for every account', async ({
  page,
  context,
}) => {
  await seedLocalData(page)
  await context.clearCookies()
  await page.goto('/sign-in')
  await page.waitForLoadState('networkidle')
  expect(await localOwners(page)).toEqual([
    ['other-account', 'playwright-user'],
    ['other-account', 'playwright-user'],
  ])
  expect(
    await page.evaluate(() =>
      localStorage.getItem('latestVisits:playwright-user'),
    ),
  ).not.toBeNull()
})

test('account deletion clears its local data while preserving another account', async ({
  page,
}) => {
  await seedLocalData(page)
  await page
    .getByRole('button', { name: 'Delete account', exact: true })
    .click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('textbox').fill('editor@example.com')
  await dialog
    .getByRole('button', { name: 'Delete account', exact: true })
    .click()
  await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/)
  await expect
    .poll(() => localOwners(page))
    .toEqual([['other-account'], ['other-account']])
  expect(
    await page.evaluate(() =>
      localStorage.getItem('latestVisits:playwright-user'),
    ),
  ).toBeNull()
  expect(
    await page.evaluate(() =>
      localStorage.getItem('latestVisits:other-account'),
    ),
  ).not.toBeNull()
})

test('a browser returning after the session cache expires removes only the proven deleted account', async ({
  page,
  context,
}) => {
  await seedLocalData(page)
  const client = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await deleteAccountData(createLibSqlDatabase(client), {
      id: 'playwright-user',
      email: 'editor@example.com',
    })
  } finally {
    client.close()
  }
  // A revoked session remains valid until its signed cache cookie expires.
  await context.clearCookies({ name: /session_data/ })
  await page.reload()
  await expect(page).toHaveURL(/\/sign-in/)
  await expect
    .poll(() => localOwners(page))
    .toEqual([['other-account'], ['other-account']])
  expect(
    await page.evaluate(() =>
      localStorage.getItem('latestVisits:other-account'),
    ),
  ).not.toBeNull()
})

test('shows an incompatible draft error and lets the user discard it', async ({
  page,
}) => {
  await seedLocalData(page, 'content/posts/hello.md')
  await page.goto(
    '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await expect(page.getByRole('alert')).toContainText(
    'The content configuration changed',
  )
  await expect(
    page.getByRole('textbox', { name: 'Title', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('dialog', { name: 'Local draft', exact: true })
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Title', exact: true }),
  ).toHaveValue('Hello world')
})

test('deletion signs out an already open editor tab and prevents drafts being recreated', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000)
  await seedLocalData(page)
  const editor = await context.newPage()
  await editor.goto(
    '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await editor
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Unsaved in another tab')
  await expect
    .poll(async () => (await localOwners(editor))[0])
    .toContain('playwright-user')
  await page
    .getByRole('button', { name: 'Delete account', exact: true })
    .click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('textbox').fill('editor@example.com')
  await dialog
    .getByRole('button', { name: 'Delete account', exact: true })
    .click()
  await expect(page).toHaveURL('/sign-in')
  await expect(editor).toHaveURL(/\/sign-in(?:\?|$)/)
  await expect
    .poll(() => localOwners(editor))
    .toEqual([['other-account'], ['other-account']])
})

test('stale browser markers neither loop a valid session nor erase either account draft', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await seedLocalData(page)
  await page.evaluate(() =>
    localStorage.setItem(
      'pagescms:deleted-accounts',
      JSON.stringify(['playwright-user', 'other-account']),
    ),
  )
  await page.goto('/')
  await expect(page.getByPlaceholder('Search by name')).toBeEnabled()
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('pagescms:deleted-accounts') ?? '[]'),
      ),
    )
    .toEqual(['other-account'])
  expect(await localOwners(page)).toEqual([
    ['other-account', 'playwright-user'],
    ['other-account', 'playwright-user'],
  ])
  expect(
    await page.evaluate(() =>
      localStorage.getItem('latestVisits:playwright-user'),
    ),
  ).not.toBeNull()
  expect(
    await page.evaluate(() => localStorage.getItem('pagescms:local-accounts')),
  ).toContain('playwright-user')
  await page.reload()
  await expect(page.getByPlaceholder('Search by name')).toBeEnabled()
  expect(await localOwners(page)).toEqual([
    ['other-account', 'playwright-user'],
    ['other-account', 'playwright-user'],
  ])
})
