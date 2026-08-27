import { expect, test } from '@playwright/test'

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
  await page.getByRole('link', { name: 'Open' }).click()

  await expect(page).toHaveURL(/\/pagescms\/fixture\/main\/collection\/posts$/)
  await expect(page.getByRole('columnheader', { name: /Title/ })).toBeVisible()
  await expect(page.getByText('Hello world', { exact: true })).toBeVisible()
  const collectionHeader = page.locator('[data-slot="repository-page-header"]')
  await expect(collectionHeader).toBeVisible()
  const collectionHeaderContract = await collectionHeader.evaluate(
    (element) => {
      const style = getComputedStyle(element)
      return {
        minHeight: style.minHeight,
        paddingLeft: style.paddingLeft,
        paddingRight: style.paddingRight,
        position: style.position,
      }
    },
  )

  const search = page.getByRole('textbox', { name: 'Search collection' })
  await search.fill('missing entry')
  await expect(page.getByText('No entries found.')).toBeVisible()
  await search.clear()
  await expect(page.getByText('Hello world', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for hello.md' }).click()
  const collectionActionsMenu = page.getByRole('menu')
  await expect(
    collectionActionsMenu.locator('[data-slot="dropdown-menu-separator"]'),
  ).toBeVisible()
  await expect(collectionActionsMenu.locator('svg')).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByRole('link', { name: 'Edit' }).click()
  await expect(page).toHaveURL(
    /\/pagescms\/fixture\/main\/collection\/posts\/entry\/content\/posts\/hello\.md$/,
  )

  const editorHeader = page.locator('[data-slot="repository-page-header"]')
  await expect(editorHeader).toBeVisible()
  await expect
    .poll(() =>
      editorHeader.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          minHeight: style.minHeight,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          position: style.position,
        }
      }),
    )
    .toEqual(collectionHeaderContract)
  for (const item of await editorHeader.locator('li').all()) {
    await expect
      .poll(() =>
        item.evaluate((element) => getComputedStyle(element).fontWeight),
      )
      .toBe('500')
  }
  await expect(
    page.getByRole('button', { name: 'Save' }).locator('svg'),
  ).toHaveCount(0)

  const title = page.getByLabel('Title')
  await expect(title).toHaveValue('Hello world')
  await expect(page.getByRole('textbox', { name: 'Body' })).toContainText(
    'Welcome to Pages CMS.',
  )
  await expect(page.locator('.cn-editor .tiptap')).toBeVisible()
  await page.getByRole('button', { name: 'source' }).click()
  await expect(page.getByRole('textbox', { name: 'Body source' })).toHaveValue(
    'Welcome to Pages CMS.',
  )
  await page.getByRole('button', { name: 'editor' }).click()
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
  ).toBeVisible()
  await expect(actionsMenu.locator('svg')).toHaveCount(0)
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
