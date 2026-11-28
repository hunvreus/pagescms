import { expect, test } from './test'

test('titles follow client navigation and use configured labels and entry paths', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Projects | Pages CMS')
  await page
    .locator('a[href="/github/pagescms/fixture/main"]', { hasText: 'Open' })
    .click()
  await expect(page).toHaveTitle('Overview - pagescms/fixture@main | Pages CMS')
  await page
    .locator('[data-slot=sidebar]')
    .getByRole('link', { name: 'Posts', exact: true })
    .click()
  await expect(page).toHaveTitle('Posts - pagescms/fixture@main | Pages CMS')
  await page.getByText('Hello world', { exact: true }).click()
  await expect(page).toHaveTitle(
    'Edit content/posts/hello.md | Posts - pagescms/fixture@main | Pages CMS',
  )
  await expect(page.locator('[data-slot=breadcrumb-page]')).toHaveText(
    'Editing "Hello world"',
  )
  await page.goBack()
  await expect(page).toHaveTitle('Posts - pagescms/fixture@main | Pages CMS')
  await page.goto('/github/pagescms/fixture/main/collection/posts/new')
  await expect(page).toHaveTitle(
    'New entry | Posts - pagescms/fixture@main | Pages CMS',
  )
  await page.goto('/github/pagescms/fixture/main/file/groups')
  await expect(page).toHaveTitle('Groups - pagescms/fixture@main | Pages CMS')
  await expect(page.locator('[data-slot=breadcrumb-page]')).toHaveText(
    'Editing "Groups"',
  )
  await page.goto('/github/pagescms/fixture/main/media/default')
  await expect(page).toHaveTitle('Media - pagescms/fixture@main | Pages CMS')
  await page.goto('/github/pagescms/fixture/main/cache')
  await expect(page).toHaveTitle('Cache - pagescms/fixture@main | Pages CMS')
  await page.goto('/settings')
  await expect(page).toHaveTitle('Account | Pages CMS')
  await expect(
    page.getByRole('heading', { name: 'Account', exact: true }),
  ).toBeVisible()
})

test('home and repository use the same account menu', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByPlaceholder('Search by name')).toBeEnabled()
  await page.getByRole('button', { name: 'User menu', exact: true }).click()
  const menu = page.getByRole('menu')
  await expect(
    menu.getByRole('menuitem', { name: 'Account', exact: true }),
  ).toBeVisible()
  const items = await menu.getByRole('menuitem').allTextContents()
  await expect(
    menu.getByRole('menuitem', { name: 'Admin', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/github/pagescms/fixture/main')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'User menu', exact: true }).click()
  await expect(menu.getByRole('menuitem')).toHaveText(items)
  await menu.getByRole('menuitem', { name: 'Account', exact: true }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page).toHaveTitle('Account | Pages CMS')
  await expect(
    page.getByRole('heading', { name: 'Account', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'User menu', exact: true }).click()
  await expect(menu.getByRole('menuitem')).toHaveText(items)
})

test('fixed-file labels stay consistent in the editor, drafts and recent visits', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/merge-review')
  const heading = page.locator('[data-slot=breadcrumb-page]')
  await expect(heading).toHaveText('Editing "Merge review"')
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('A different content title')
  await expect(
    page.getByRole('button', { name: /^Local draft:/ }),
  ).toBeVisible()
  await expect(heading).toHaveText('Editing "Merge review"')
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(
    page
      .getByRole('list', { name: 'Recently visited', exact: true })
      .getByRole('link', { name: 'Merge review', exact: true }),
  ).toBeVisible()

  await page
    .getByRole('list', { name: 'Local drafts', exact: true })
    .getByRole('link', { name: 'Merge review', exact: true })
    .click()
  await expect(heading).toHaveText('Editing "Merge review"')
  await expect(
    page.getByRole('textbox', { name: 'Title', exact: true }),
  ).toHaveValue('A different content title')
})
