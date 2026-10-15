import type { Route } from '@playwright/test'
import { expect, test } from './test'
import { eq, inArray } from 'drizzle-orm'
import { createDatabase } from '#/server/database/client.server'
import {
  actionRunTable,
  collaboratorTable,
  userTable,
} from '#/server/database/schema'
import { configuration } from './github-fixture.server'

const repository = '/pagescms/fixture/main'
test.describe.configure({ mode: 'serial' })

test('actions refreshes manually and selects workflows from the header', async ({
  page,
}) => {
  await page.goto(`${repository}/actions`)
  await page.waitForLoadState('networkidle')
  const header = page.locator('[data-slot="repository-page-header"]')
  await expect(
    page.getByRole('table', { name: 'Recent action runs' }),
  ).toBeVisible()
  await expect(
    header.getByRole('textbox', { name: 'Search action runs' }),
  ).toBeVisible()
  await header.getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Deploy site', exact: true }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Deploy site?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await header.getByRole('button', { name: 'Refresh action runs' }).click()
  await expect(
    header.getByRole('button', { name: 'Refresh action runs' }),
  ).toBeEnabled()
})

test('collaborator removal requires confirmation', async ({ page }) => {
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('Isolated browser database is required')
  const database = createDatabase({ url })
  const [collaborator] = await database
    .insert(collaboratorTable)
    .values({
      type: 'github',
      installationId: 1,
      ownerId: 1,
      owner: 'pagescms',
      repo: 'fixture',
      email: 'table-action@example.com',
    })
    .returning({ id: collaboratorTable.id })
  try {
    await page.goto(`${repository}/collaborators`)
    await page.waitForLoadState('networkidle')
    const remove = page.getByRole('button', {
      name: 'Remove table-action@example.com',
    })
    await expect(remove).toHaveText('Remove')
    const search = page
      .locator('[data-slot="repository-page-header"]')
      .getByRole('textbox', { name: 'Search collaborators' })
    await search.fill('no-match')
    await expect(
      page.getByRole('cell', { name: 'No matching collaborators.' }),
    ).toBeVisible()
    await search.fill('table-action')
    await expect(remove).toBeVisible()
    await search.clear()
    await remove.click()
    const confirmation = page.getByRole('alertdialog', {
      name: 'Remove collaborator?',
    })
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: 'Cancel' }).click()
    await expect(remove).toBeVisible()
  } finally {
    await database
      .delete(collaboratorTable)
      .where(eq(collaboratorTable.id, collaborator.id))
  }
})

test('cache controls remain on the cache page', async ({ page }) => {
  await page.goto(`${repository}/cache`)
  await page.waitForLoadState('networkidle')
  const header = page.locator('[data-slot="repository-page-header"]')
  await expect(
    header.getByRole('button', { name: 'Clear all', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Refresh content cache' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'View directories' }),
  ).toHaveCount(0)
  const contentBadge = page.getByText(/^\d+ files$/)
  const directoryBadge = page.getByText(/^\d+ directories$/)
  await expect(contentBadge).toBeVisible()
  await expect(directoryBadge).toBeVisible()
  if (
    (await contentBadge.textContent()) === '0 files' &&
    (await directoryBadge.textContent()) === '0 directories'
  ) {
    await expect(
      page.getByRole('button', { name: 'Refresh content cache', exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByRole('button', { name: 'Clear content cache', exact: true }),
    ).toBeDisabled()
  }
  await expect(
    page.getByRole('button', {
      name: 'Refresh configuration cache',
      exact: true,
    }),
  ).toBeEnabled()
  let releaseInitial!: () => void
  const initialPending = new Promise<void>((resolve) => {
    releaseInitial = resolve
  })
  const delayInitial = async (route: Route) => {
    await initialPending
    await route.continue()
  }
  await page.route('**/_serverFn/**', delayInitial)
  try {
    await page.getByRole('button', { name: 'Show cached files' }).click()
    const loadingTable = page.getByRole('table', {
      name: 'Cached files',
      exact: true,
    })
    await expect(loadingTable).toHaveAttribute('aria-busy', 'true')
    await expect(loadingTable.locator('tbody tr')).toHaveCount(10)
    await loadingTable.screenshot({
      path: test.info().outputPath('cached-files-loading.png'),
      animations: 'disabled',
    })
    const initialFilter = page.getByRole('textbox', {
      name: 'Filter cached files',
    })
    await expect(initialFilter).toBeDisabled()
    await expect(
      initialFilter.locator('..').getByLabel('Refreshing results'),
    ).toHaveCount(0)
  } finally {
    const response = page.waitForResponse('**/_serverFn/**')
    releaseInitial()
    await response
    await page.unroute('**/_serverFn/**', delayInitial)
  }
  await expect(
    page.getByRole('textbox', { name: 'Filter cached files' }),
  ).toBeEnabled()
  await expect(
    page.getByRole('table', { name: 'Cached files', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('columnheader', { name: 'Last change commit' }),
  ).toBeVisible()
  const cachedTable = page.getByRole('table', {
    name: 'Cached files',
    exact: true,
  })
  const viewport = cachedTable.locator('..').locator('..')
  expect(
    await cachedTable
      .locator('..')
      .evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true)
  expect(
    await cachedTable
      .locator('th')
      .evaluateAll((heads) =>
        heads.every((head) => head.scrollWidth <= head.clientWidth),
      ),
  ).toBe(true)
  const filter = page.getByRole('textbox', { name: 'Filter cached files' })
  await expect(
    filter.locator('..').getByLabel('Refreshing results'),
  ).toHaveCount(0)
  const previousRows = await cachedTable.textContent()
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const delay = async (route: Route) => {
    await pending
    await route.continue()
  }
  await page.route('**/_serverFn/**', delay)
  try {
    await filter.fill('no-cached-file-matches-this')
    await expect(
      filter.locator('..').getByLabel('Refreshing results'),
    ).toBeVisible()
    expect(await cachedTable.textContent()).toBe(previousRows)
  } finally {
    const response = page.waitForResponse('**/_serverFn/**')
    release()
    await response
    await page.unroute('**/_serverFn/**', delay)
  }
  await expect(
    cachedTable.getByText('No cached files.', { exact: true }),
  ).toBeVisible()
  expect(
    await viewport.evaluate((node) => node.scrollHeight <= node.clientHeight),
  ).toBe(true)
  expect(
    await filter.evaluate((node) => node.getBoundingClientRect().height),
  ).toBe(28)
  await expect(
    page.getByRole('navigation', { name: 'Cached files pagination' }),
  ).toBeVisible()
  await filter.fill('')
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Clear all cached data?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
})

test('configuration edits source directly with validation and draft-backed navigation', async ({
  page,
}) => {
  await page.goto(`${repository}/configuration`)
  await page.waitForLoadState('networkidle')
  const header = page.locator('[data-slot="repository-page-header"]')
  const editor = page.getByRole('textbox', { name: 'Pages CMS configuration' })
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await expect(editor).toContainText('content:')
  expect(
    await editor.evaluate(
      (element) => element.closest('.max-w-3xl')?.getBoundingClientRect().width,
    ),
  ).toBeLessThanOrEqual(768)
  await header.getByRole('button', { name: 'Entry history' }).click()
  await expect(page.getByText('No history found.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(
    header.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await header.getByRole('button', { name: 'Entry actions' }).click()
  await expect(
    page.getByRole('menuitem', { name: 'View on GitHub' }),
  ).toHaveAttribute(
    'href',
    'https://github.com/pagescms/fixture/blob/main/.pages.yml',
  )
  await expect(
    page.getByRole('menuitem', { name: 'Rename', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('menuitem', { name: 'Delete', exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('table', { name: 'Repository collaborators' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Clear all', exact: true }),
  ).toHaveCount(0)
  await editor.fill('content: [')
  await expect(
    page.locator('.cm-lintRange-error, .cm-lintPoint-error'),
  ).not.toHaveCount(0)
  await expect(
    header.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.getByRole('link', { name: 'Collaborators', exact: true }).click()
  await expect(page).toHaveURL(`${repository}/collaborators`)
  await expect(
    page
      .locator('[data-slot="repository-page-header"]')
      .getByRole('button', { name: 'Invite collaborator' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Invite collaborator' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Invite collaborators' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Configuration', exact: true }).click()
  await expect(editor).toContainText('content: [')
  await editor.fill(`# Saved configuration\n${configuration}`)
  await header.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    header.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.reload()
  await expect(editor).toContainText('# Saved configuration')
})

test('action run pagination and search filter the runs table', async ({
  page,
}) => {
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('Isolated browser database is required')
  const database = createDatabase({ url })
  const rows = await database
    .insert(actionRunTable)
    .values(
      Array.from({ length: 14 }, (_, index) => ({
        owner: 'pagescms',
        repo: 'fixture',
        ref: 'main',
        workflowRef: 'main',
        sha: `pagination-${index}`,
        actionName: index < 12 ? 'deploy' : 'archived-action',
        workflow: 'deploy.yml',
        contextType: 'repository',
        status: 'completed',
        conclusion: 'success',
        triggeredBy: { name: `Pager ${index}`, userId: 'playwright-user' },
        payload: {},
        createdAt: new Date(1_700_000_000_000 + index * 1000),
      })),
    )
    .returning({ id: actionRunTable.id })
  try {
    await page.goto(`${repository}/actions?action=deploy`)
    await page.waitForLoadState('networkidle')
    const dialog = page.locator('main').last()
    const bodyRows = dialog.locator('tbody tr')
    await expect(bodyRows).toHaveCount(10)
    const pager = dialog.getByRole('navigation', {
      name: 'Action runs pagination',
    })
    await expect(pager.getByText('Page 1 of 2')).toBeVisible()
    await expect(pager.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await expect(dialog.getByText('Pager 11', { exact: true })).toBeVisible()
    await pager.getByRole('button', { name: 'Next' }).click()
    await expect(bodyRows).toHaveCount(2)
    await expect(pager.getByText('Page 2 of 2')).toBeVisible()
    await expect(pager.getByRole('button', { name: 'Next' })).toBeDisabled()
    await expect(dialog.getByText('Pager 0', { exact: true })).toBeVisible()
    await pager.getByRole('button', { name: 'Previous' }).click()
    await expect(bodyRows).toHaveCount(10)
    await expect(dialog).toBeVisible()
    const search = dialog.getByRole('textbox', { name: 'Search action runs' })
    await search.fill('Pager 0')
    await expect(bodyRows).toHaveCount(1)
    await expect(dialog.getByText('Pager 0', { exact: true })).toBeVisible()
    await dialog
      .getByRole('combobox', { name: 'Filter runs by action' })
      .click()
    await page
      .getByRole('option', { name: 'archived-action', exact: true })
      .click()
    await expect(dialog.getByText('No matching action runs.')).toBeVisible()
    await search.clear()
    await expect(bodyRows).toHaveCount(2)
    await dialog
      .getByRole('combobox', { name: 'Filter runs by action' })
      .click()
    await page.getByRole('option', { name: 'All actions', exact: true }).click()
    await expect(bodyRows).toHaveCount(10)
    await expect(pager.getByText('Page 1 of 2')).toBeVisible()
  } finally {
    await database.delete(actionRunTable).where(
      inArray(
        actionRunTable.id,
        rows.map((row) => row.id),
      ),
    )
  }
})

test('Admin navigation opens separate pages with the selected link active', async ({
  page,
}) => {
  await page.goto(`${repository}/configuration`)
  for (const [path, title] of [
    ['collaborators', 'Collaborators'],
    ['actions', 'Actions'],
    ['cache', 'Cache'],
    ['configuration', 'Configuration'],
  ]) {
    await page.getByRole('link', { name: title, exact: true }).click()
    await expect(page).toHaveURL(`${repository}/${path}`)
    await expect(
      page
        .locator('[data-slot="repository-page-header"]')
        .getByRole('heading', { name: title, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: title, exact: true }),
    ).toHaveAttribute('data-active', 'true')
  }
})

test('repository pages keep the same space below the header', async ({
  page,
}) => {
  for (const path of [
    'actions',
    'cache',
    'collaborators',
    'configuration',
    'collection/posts',
    'file/code',
  ]) {
    await page.goto(`${repository}/${path}`)
    await page.waitForLoadState('networkidle')
    const spacing = await page
      .locator('[data-slot="repository-page-header"]')
      .evaluate((header) => {
        const body = header.nextElementSibling!
        const content = body.matches('section')
          ? body.querySelector('table')!
          : body.firstElementChild!
        return (
          content.getBoundingClientRect().top -
          header.getBoundingClientRect().bottom
        )
      })
    expect(spacing, path).toBe(24)
  }
})

test('cache management is opt-in and disabled routes cannot be opened directly', async ({
  page,
}) => {
  await page.goto(`${repository}/configuration`)
  await page.waitForLoadState('networkidle')
  const editor = page.getByRole('textbox', { name: 'Pages CMS configuration' })
  const original = configuration
  try {
    await editor.fill(original.replace('cache: true', 'cache: false'))
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByRole('link', { name: 'Cache', exact: true }),
    ).toHaveCount(0)
    await page.goto(`${repository}/cache`)
    await page.waitForLoadState('networkidle')
    await expect(page).not.toHaveURL(`${repository}/cache`)
    await expect(
      page.getByRole('heading', { name: 'Cache', exact: true }),
    ).toHaveCount(0)
  } finally {
    await page.goto(`${repository}/configuration`)
    await page.waitForLoadState('networkidle')
    await editor.fill(original)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await expect(
      page.getByRole('link', { name: 'Cache', exact: true }),
    ).toBeVisible()
  }
})

test('invites collaborators from an expanding email list with validation and Enter submission', async ({
  page,
}) => {
  const database = createDatabase({ url: process.env.E2E_DATABASE_URL! })
  const now = new Date()
  await database.insert(userTable).values([
    {
      id: 'invite-alice',
      name: 'Account Alice',
      email: 'alice@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'invite-bob',
      name: 'Account Bob',
      email: 'bob@example.com',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await page.goto(`${repository}/collaborators`)
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('button', { name: 'Invite collaborator', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Invite collaborators' })
  const emails = dialog.getByLabel('Email addresses')
  const initialHeight = await emails.evaluate(
    (element) => element.getBoundingClientRect().height,
  )
  expect(initialHeight).toBeLessThan(50)
  await emails.fill('alice@example.com, invalid')
  await emails.press('Enter')
  await expect(dialog.getByRole('alert')).toContainText('valid email address')
  await expect(dialog).toBeVisible()
  await expect(
    page
      .getByRole('table', { name: 'Repository collaborators' })
      .getByText('alice@example.com', { exact: true }),
  ).toHaveCount(0)
  await emails.fill('alice@example.com; bob@example.com\nALICE@example.com')
  await emails.press('End')
  await emails.press('Shift+Enter')
  await expect(emails).toHaveValue(
    'alice@example.com; bob@example.com\nALICE@example.com\n',
  )
  expect(
    await emails.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThan(initialHeight)
  await emails.press('Enter')
  await expect(dialog).not.toBeVisible()
  const table = page.getByRole('table', { name: 'Repository collaborators' })
  await expect(
    table.getByText('alice@example.com', { exact: true }),
  ).toHaveCount(1)
  await expect(table.getByText('bob@example.com', { exact: true })).toHaveCount(
    1,
  )
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(
    table.getByText('alice@example.com', { exact: true }),
  ).toBeVisible()
  await expect(
    table.getByText('bob@example.com', { exact: true }),
  ).toBeVisible()
})

test('shares automatic action status updates between the table and persistent notification across navigation', async ({
  page,
}) => {
  const database = createDatabase({ url: process.env.E2E_DATABASE_URL! })
  await page.goto(`${repository}/actions`)
  await page.waitForLoadState('networkidle')
  await page.clock.install()
  const header = page.locator('[data-slot="repository-page-header"]')
  await header.getByRole('button', { name: 'Run', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Deploy site', exact: true }).click()
  await page
    .getByRole('alertdialog', { name: 'Deploy site?' })
    .getByRole('button', { name: 'Deploy', exact: true })
    .click()
  const notification = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: 'Deploy site' })
  await expect(notification).toContainText('is queued')
  await page.waitForLoadState('networkidle')
  const [run] = await database
    .select()
    .from(actionRunTable)
    .where(eq(actionRunTable.owner, 'pagescms'))
  let statusRequests = 0
  page.on('request', (request) => {
    if (request.url().includes('/_serverFn/') && request.method() === 'GET')
      statusRequests++
  })
  await database
    .update(actionRunTable)
    .set({ status: 'in_progress', workflowRunId: 123, checkedAt: new Date() })
    .where(eq(actionRunTable.id, run.id))
  await page.clock.fastForward(15_000)
  await expect(notification).toContainText('is running')
  await expect(
    page
      .getByRole('table', { name: 'Recent action runs' })
      .getByText('In progress', { exact: true }),
  ).toBeVisible()
  expect(statusRequests).toBe(1)
  await expect(header.getByLabel('Refreshing results')).toHaveCount(0)
  await page.getByRole('link', { name: 'Collaborators', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await database
    .update(actionRunTable)
    .set({ status: 'completed', conclusion: 'success', checkedAt: new Date() })
    .where(eq(actionRunTable.id, run.id))
  await page.clock.fastForward(15_000)
  await expect(notification).toContainText('succeeded')
  const finalRequests = statusRequests
  await page.clock.fastForward(30_000)
  expect(statusRequests).toBe(finalRequests)
})
