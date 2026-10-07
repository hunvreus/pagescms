import { expect, test } from './test'

test('navigates a repository and persists a structured entry update', async ({
  page,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Open a project' }),
  ).toBeVisible()
  await expect(page.getByText('fixture', { exact: true })).toBeVisible({
    timeout: 15_000,
  })
  await page
    .locator('a[href="/pagescms/fixture/main"]', { hasText: 'Open' })
    .click()

  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await expect(page).toHaveURL(/\/pagescms\/fixture\/main\/collection\/posts$/)
  await expect(page.getByRole('columnheader', { name: /Title/ })).toBeVisible()
  const actionHeader = page.getByRole('columnheader').last()
  await expect(actionHeader).toHaveText('')
  const actionCell = page
    .getByRole('button', { name: 'Actions for hello.md' })
    .locator('xpath=ancestor::td[1]')
  await expect(actionCell.locator('[data-slot="button-group"]')).toHaveCount(0)
  await expect(page.getByText('Hello world', { exact: true })).toBeVisible()
  const tableContainer = page.locator('[data-slot="table-container"]')
  await expect(tableContainer).toHaveCSS('overflow-x', 'auto')
  const collectionHeader = page.locator('[data-slot="repository-page-header"]')
  await expect(collectionHeader).toBeVisible()

  const search = page.getByRole('textbox', { name: 'Search collection' })
  await search.fill('missing entry')
  await expect(page.getByText('No results.')).toBeVisible()
  await search.clear()
  await expect(page.getByText('Hello world', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for hello.md' }).click()
  const collectionActionsMenu = page.getByRole('menu')
  await expect(
    collectionActionsMenu.locator('[data-slot="dropdown-menu-separator"]'),
  ).toHaveCount(2)
  await expect(
    collectionActionsMenu.getByRole('menuitem', { name: 'View on GitHub' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'Edit' }).click()
  await expect(page).toHaveURL(
    /\/pagescms\/fixture\/main\/collection\/posts\/entry\/content\/posts\/hello\.md$/,
  )

  await expect(page.getByLabel('Title')).toHaveValue('Hello world')

  const editorHeader = page.locator('[data-slot="repository-page-header"]')
  await expect(editorHeader).toBeVisible()
  const saveButton = editorHeader.getByRole('button', {
    name: 'Save',
    exact: true,
  })
  const entryAction = editorHeader.getByRole('button', {
    name: 'Test entry action',
  })
  const entryMenu = editorHeader.getByRole('button', { name: 'Entry actions' })
  await expect(editorHeader.locator('[data-slot="button-group"]')).toHaveCount(
    0,
  )
  await expect(saveButton).toHaveCSS('height', '32px')
  await expect(entryAction).toHaveCSS('height', '32px')
  await expect(entryMenu).toHaveCSS('height', '32px')
  const title = page.getByLabel('Title')
  await expect(title).toHaveValue('Hello world')
  await expect(page.getByRole('textbox', { name: 'Body' })).toContainText(
    'Welcome to Pages CMS.',
  )
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Body source' })).toHaveValue(
    'Welcome to Pages CMS.\n',
  )
  await page.getByRole('tab', { name: 'Editor', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Body' })).toBeVisible()

  await page.getByRole('button', { name: 'Entry history' }).click()
  const historyMenu = page.getByRole('menu')
  await expect(historyMenu).toBeVisible()
  await expect(historyMenu.getByText('No history found.')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Entry actions' }).click()
  const actionsMenu = page.getByRole('menu')
  await expect(
    actionsMenu.locator('[data-slot="dropdown-menu-separator"]'),
  ).toHaveCount(2)
  await expect(
    actionsMenu.getByRole('menuitem', { name: 'View on GitHub' }),
  ).toBeVisible()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await expect(page.getByRole('dialog', { name: 'Rename entry' })).toBeVisible()
  await expect(page.getByLabel('Filename')).toHaveValue('hello.md')
  await page.getByRole('button', { name: 'Cancel' }).click()

  await title.fill('Updated in Playwright')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()

  await page.reload()
  await expect(page.getByLabel('Title')).toHaveValue('Updated in Playwright')

  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.getByRole('link', { name: 'New entry' }).click()
  await expect(page).toHaveURL(
    /\/pagescms\/fixture\/main\/collection\/posts\/new$/,
  )
  await expect(page.getByLabel('Title')).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Body' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create entry' })).toBeVisible()
})
