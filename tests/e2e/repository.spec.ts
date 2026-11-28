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
    .locator('a[href="/github/pagescms/fixture/main"]', { hasText: 'Open' })
    .click()

  await page
    .locator('[data-slot=sidebar]')
    .getByRole('link', { name: 'Posts', exact: true })
    .click()
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
  ).toHaveCount(1)
  await expect(
    collectionActionsMenu.getByRole('menuitem', { name: 'View on GitHub' }),
  ).toBeVisible()
  expect(
    await collectionActionsMenu
      .getByRole('menuitem', { name: 'View on GitHub' })
      .evaluate((element) => getComputedStyle(element).whiteSpace),
  ).toBe('nowrap')
  await page.keyboard.press('Escape')

  await page
    .locator(
      'a[href="/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md"]',
      { hasText: 'Edit' },
    )
    .click()
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
  const historyAndMenu = editorHeader.locator('[data-slot="button-group"]')
  await expect(historyAndMenu).toHaveCount(1)
  await expect(
    historyAndMenu.getByRole('button', { name: 'Entry history' }),
  ).toBeVisible()
  await expect(
    historyAndMenu.getByRole('button', { name: 'Entry actions' }),
  ).toBeVisible()
  await expect(
    historyAndMenu.getByRole('button', { name: 'Test entry action' }),
  ).toHaveCount(0)
  await expect(saveButton).toHaveCSS('height', '32px')
  await expect(entryAction).toHaveCSS('height', '32px')
  await expect(entryMenu).toHaveCSS('height', '32px')
  const title = page.getByLabel('Title')
  await expect(title).toHaveValue('Hello world')
  await expect(page.getByRole('textbox', { name: 'Body' })).toContainText(
    'Welcome to Pages CMS.',
  )
  await page.getByRole('radio', { name: 'Source', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Body source' })).toHaveValue(
    'Welcome to Pages CMS.\n',
  )
  await page.getByRole('radio', { name: 'Editor', exact: true }).click()
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
  ).toHaveCount(1)
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
  await expect(page.getByRole('button', { name: 'Save' })).toHaveAttribute(
    'aria-busy',
    'false',
  )

  await page.reload()
  await expect(page.getByLabel('Title')).toHaveValue('Updated in Playwright')

  await page.goto('/github/pagescms/fixture/main/collection/posts')
  await page.getByRole('link', { name: 'New entry' }).click()
  await expect(page).toHaveURL(
    /\/pagescms\/fixture\/main\/collection\/posts\/new(?:\?draft=[^&]+)?$/,
  )
  await expect(page.getByLabel('Title')).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Body' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create entry' })).toBeVisible()
})

test('opening rich text preserves source and stays clean until editing', async ({
  page,
}) => {
  await page.goto(
    '/github/pagescms/fixture/main/collection/posts/entry/content/posts/unchanged.md',
  )
  const save = page.getByRole('button', { name: 'Save', exact: true })
  const body = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(body.getByRole('img', { name: 'Hero' })).toBeVisible()
  await expect(save).toBeDisabled()
  await page.getByRole('radio', { name: 'Source', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Body source' })).toHaveValue(
    '![Hero](<public/images/hero.svg>)\n',
  )
  await page.getByRole('radio', { name: 'Editor', exact: true }).click()
  await expect(body.getByRole('img', { name: 'Hero' })).toBeVisible()
  await expect(save).toBeDisabled()
  await body.fill('An actual edit')
  await expect(save).toBeEnabled()
})

test('configured custom commit messages use a cancelable dialog with normal saves', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/configuration')
  const configuration = page.getByRole('textbox', {
    name: 'Configuration',
    exact: true,
  })
  await configuration.fill(
    'settings:\n  commit:\n    allowCustomMessage: true\nmedia: public/images\ncontent:\n  - name: posts\n    type: collection\n    path: content/posts\n    fields:\n      - name: title\n        label: Title\n        type: string\n      - name: body\n        label: Body\n        type: rich-text\n',
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('Configuration saved', { exact: true }),
  ).toBeVisible()
  await page.goto(
    '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Custom message audit')
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await save.click()
  const dialog = page.getByRole('dialog', { name: 'Save changes', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(save).toBeEnabled()
  await save.click()
  await dialog
    .getByRole('textbox', { name: 'Commit message (optional)', exact: true })
    .fill('Custom audit commit')
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
})

test('switches accounts after denied repository access and preserves the destination', async ({
  page,
}) => {
  const destination = '/github/pagescms/access-denied-fixture'
  await page.goto(destination)
  await page.getByRole('button', { name: 'Switch account' }).click()
  await expect(page).toHaveURL(
    '/sign-in?redirect=%2Fgithub%2Fpagescms%2Faccess-denied-fixture',
  )
  await expect(
    page.getByRole('heading', { name: 'Sign in to Pages CMS' }),
  ).toBeVisible()
})

test('denied collections render a project error', async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-pagescms-e2e-collection-access': 'deny' })
  await page.goto('/github/pagescms/fixture/main')
  await page.getByRole('link', { name: 'Posts', exact: true }).first().click()
  await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
  const response = await page.goto(
    '/github/pagescms/fixture/main/collection/posts',
  )
  expect(response?.status()).toBe(200)
  await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to overview' })).toBeVisible()
})

test('read-only collections offer View and hide creation controls', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({
    'x-pagescms-e2e-collection-access': 'read-only',
  })
  await page.goto('/github/pagescms/fixture/main/collection/posts')
  await expect(
    page.getByRole('link', { name: 'View', exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Edit', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'New entry' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New folder' })).toHaveCount(0)
  await page.goto('/github/pagescms/fixture/main/collection/posts/new')
  await expect(page.getByText('Access denied', { exact: true })).toBeVisible()
})
