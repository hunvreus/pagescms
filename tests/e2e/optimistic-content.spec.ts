import type { Page, Route } from '@playwright/test'
import { expect, test } from './test'

const entry =
  '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
const collection = '/pagescms/fixture/main/collection/posts'
const title = (page: Page) =>
  page.getByRole('textbox', { name: 'Title', exact: true })
const save = (page: Page) =>
  page.getByRole('button', { name: 'Save', exact: true })
const overview = (page: Page) =>
  page.getByRole('link', { name: 'Overview', exact: true })
test.setTimeout(60_000)
async function holdWrite(page: Page) {
  let release!: (route: Route) => void
  const request = new Promise<Route>((resolve) => {
    release = resolve
  })
  await page.route('**/*', async (route) => {
    if (route.request().method() === 'POST') release(route)
    else await route.continue()
  })
  return request
}
async function drafts(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        Array<{ value: unknown; baseSha: string | null; pendingSave?: unknown }>
      >((resolve, reject) => {
        const open = indexedDB.open('pagescms-content-drafts')
        open.onsuccess = () => {
          const request = open.result
            .transaction('drafts')
            .objectStore('drafts')
            .getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        }
      }),
  )
}

test('save continues off-page, preserves immediate later typing, and permits a second save with the new SHA', async ({
  page,
}) => {
  await page.goto(entry)
  await expect(title(page)).toBeVisible()
  await page.waitForLoadState('networkidle')
  await title(page).fill('Submitted title')
  const held = holdWrite(page)
  await save(page).click()
  const route = await held
  await expect(
    page.getByRole('button', { name: 'Saving', exact: true }),
  ).toBeDisabled()
  await expect(title(page)).toBeEditable()
  await title(page).fill('Newer title while saving')
  await overview(page).click()
  await expect(page.getByRole('table', { name: 'Local drafts' })).toContainText(
    'Newer title while saving',
  )
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(title(page)).toHaveValue('Newer title while saving')
  await expect(
    page.getByRole('button', { name: 'Saving', exact: true }),
  ).toBeDisabled()
  await overview(page).click()
  await route.continue()
  await page.unroute('**/*')
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  const stored = await drafts(page)
  expect(stored).toHaveLength(1)
  expect(stored[0].baseSha).not.toBe('hello-sha')
  expect(stored[0].pendingSave).toBeUndefined()
  await page.reload()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(title(page)).toHaveValue('Newer title while saving')
  await expect(save(page)).toBeEnabled()
  await save(page).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(title(page)).toHaveValue('Newer title while saving')
  await expect(save(page)).toBeDisabled()
})

test('a failed background save retains edits and reports failure when reopened', async ({
  page,
}) => {
  await page.goto(entry)
  await expect(title(page)).toBeVisible()
  await title(page).fill('Recover failed save')
  const held = holdWrite(page)
  await save(page).click()
  const route = await held
  await overview(page).click()
  await route.abort('failed')
  await page.unroute('**/*')
  await expect(
    page.getByText(
      'Could not complete the file operation. Your local draft is retained.',
    ),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(title(page)).toHaveValue('Recover failed save')
  await expect(save(page)).toBeEnabled()
  await save(page).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
})

test('background create displays a pending row, then a usable confirmed entry', async ({
  page,
}) => {
  await page.goto(collection)
  await page.getByRole('link', { name: 'New entry', exact: true }).click()
  await title(page).fill('Created in background')
  const held = holdWrite(page)
  await page.getByRole('button', { name: 'Create entry', exact: true }).click()
  const route = await held
  await page.getByRole('link', { name: 'Posts', exact: true }).first().click()
  await expect(
    page.getByRole('row').filter({ hasText: 'Created in background' }),
  ).toContainText('Creating…')
  await expect(
    page.getByRole('link', { name: 'Created in background', exact: true }),
  ).toHaveCount(0)
  const pendingRow = page
    .getByRole('row')
    .filter({ hasText: 'Created in background' })
  await expect(pendingRow.getByRole('link')).toHaveCount(0)
  await expect(
    pendingRow.getByRole('button', { name: 'Edit', exact: true }),
  ).toBeDisabled()
  await route.continue()
  await page.unroute('**/*')
  await expect(page.getByText('File created', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/collection\/posts$/)
  await page
    .getByRole('link', { name: 'Created in background', exact: true })
    .click()
  await expect(title(page)).toHaveValue('Created in background')
  expect(await drafts(page)).toHaveLength(0)
})

test('renaming an entry migrates unsaved content and its draft SHA', async ({
  page,
}) => {
  await page.goto(entry)
  await expect(title(page)).toBeVisible()
  await title(page).fill('Dirty rename draft')
  await page.getByRole('button', { name: 'Entry actions' }).click()
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Rename entry' })
  await dialog.getByRole('textbox', { name: 'Filename' }).fill('renamed.md')
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click()
  await expect(page).toHaveURL(/\/entry\/content\/posts\/renamed.md$/)
  await expect(title(page)).toHaveValue('Dirty rename draft')
  await save(page).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(title(page)).toHaveValue('Dirty rename draft')
  expect(await drafts(page)).toHaveLength(0)
})

test('failed delete restores the row and keeps its local draft', async ({
  page,
}) => {
  await page.goto(entry)
  await title(page).fill('Draft kept after failed delete')
  await overview(page).click()
  await page
    .getByRole('table', { name: 'Recently opened' })
    .getByRole('button', { name: 'Open', exact: true })
    .click()
  await page.getByRole('button', { name: 'Entry actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  const held = holdWrite(page)
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  const route = await held
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await page.getByRole('link', { name: 'Posts', exact: true }).first().click()
  await expect(
    page.getByRole('link', { name: 'Hello world', exact: true }),
  ).toHaveCount(0)
  await route.abort('failed')
  await page.unroute('**/*')
  await expect(
    page.getByRole('link', { name: 'Hello world', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Hello world', exact: true }).click()
  await expect(title(page)).toHaveValue('Draft kept after failed delete')
})

test('confirmed delete removes the matching draft after leaving the editor', async ({
  page,
}) => {
  await page.goto(entry)
  await title(page).fill('Discard only after confirmed delete')
  await page.getByRole('button', { name: 'Entry actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('local draft will also be discarded')
  const held = holdWrite(page)
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
  const route = await held
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await overview(page).click()
  await route.continue()
  await page.unroute('**/*')
  await expect(page.getByText('File deleted', { exact: true })).toBeVisible()
  expect(await drafts(page)).toHaveLength(0)
  await expect(page).toHaveURL(/\/pagescms\/fixture\/main$/)
})

test('a lost save response reconciles newer edits on reload without another write', async ({
  page,
}) => {
  await page.goto(entry)
  await expect(title(page)).toBeVisible()
  await title(page).fill('Committed before response was lost')
  const held = holdWrite(page)
  await save(page).click()
  const route = await held
  await title(page).fill('Later edit retained across reload')
  await overview(page).click()
  const response = await route.fetch()
  expect(response.ok()).toBe(true)
  await route.abort('failed')
  await page.unroute('**/*')
  await expect(
    page.getByText(
      'Could not complete the file operation. Your local draft is retained.',
    ),
  ).toBeVisible()
  const originalSha = (await drafts(page))[0].baseSha
  await page.reload()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(title(page)).toHaveValue('Later edit retained across reload')
  const recovered = await drafts(page)
  expect(recovered[0].baseSha).not.toBe(originalSha)
  expect(recovered[0].pendingSave).toBeUndefined()
  await save(page).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(title(page)).toHaveValue('Later edit retained across reload')
})

test('delete never discards a draft changed in another tab after submission', async ({
  page,
  context,
}) => {
  await page.goto(entry)
  await title(page).fill('First draft')
  await overview(page).click()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  const second = await context.newPage()
  await second.goto(entry)
  await expect(title(second)).toHaveValue('First draft')
  await page.getByRole('button', { name: 'Entry actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  const held = holdWrite(page)
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete', exact: true })
    .click()
  const route = await held
  await title(second).fill('Newer draft from another tab')
  await expect
    .poll(async () => JSON.stringify(await drafts(second)))
    .toContain('Newer draft from another tab')
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await overview(page).click()
  await route.continue()
  await page.unroute('**/*')
  await expect(page.getByText('File deleted', { exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Local drafts' })).toContainText(
    'Newer draft from another tab',
  )
  await expect(
    page
      .getByRole('table', { name: 'Local drafts' })
      .getByRole('button', { name: 'Download', exact: true }),
  ).toBeVisible()
  expect((await drafts(page))[0].value).toMatchObject({
    title: 'Newer draft from another tab',
  })
})

test('an unavailable background collection refresh cannot fail a confirmed save', async ({
  page,
}) => {
  await page.goto(collection)
  await page.getByRole('link', { name: 'Hello world', exact: true }).click()
  await title(page).fill('Confirmed without list refresh')
  const held = holdWrite(page)
  await save(page).click()
  const route = await held
  await page.getByRole('link', { name: 'Posts', exact: true }).first().click()
  await expect(
    page.getByRole('link', { name: /Confirmed without list refresh/ }),
  ).toBeVisible()
  await route.continue()
  await page.unroute('**/*')
  await page.route('**/_serverFn/**', async (request) => {
    if (request.request().method() === 'GET') await request.abort('failed')
    else await request.continue()
  })
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page
    .getByRole('link', { name: 'Confirmed without list refresh', exact: true })
    .click()
  await expect(title(page)).toHaveValue('Confirmed without list refresh')
  await expect(save(page)).toBeDisabled()
  expect(await drafts(page)).toHaveLength(0)
})

test('resuming a pending creation opens its confirmed entry when the request completes', async ({
  page,
}) => {
  await page.goto(collection)
  await page.getByRole('link', { name: 'New entry', exact: true }).click()
  await title(page).fill('Resumed pending creation')
  const held = holdWrite(page)
  await page.getByRole('button', { name: 'Create entry', exact: true }).click()
  const route = await held
  await overview(page).click()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(title(page)).toHaveValue('Resumed pending creation')
  await expect(
    page.getByRole('button', { name: 'Creating', exact: true }),
  ).toBeDisabled()
  await route.continue()
  await page.unroute('**/*')
  await expect(page.getByText('File created', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/collection\/posts\/entry\/content\/posts\//)
  await expect(title(page)).toHaveValue('Resumed pending creation')
})
