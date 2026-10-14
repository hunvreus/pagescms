import type { Page } from '@playwright/test'
import { expect, test } from './test'

const entry =
  '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'

async function saveAndReload(page: Page) {
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(save).toBeDisabled()
  await page.reload()
  await page.waitForLoadState('networkidle')
}

test('existing and new blocks retain rich text and sibling values through repeated saves', async ({
  page,
}) => {
  await page.goto(entry)
  await expect(
    page.getByRole('textbox', { name: 'Body', exact: true }),
  ).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.goto('/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('button', { name: 'Item #1', exact: true })
    .last()
    .click()
  const body = page.getByRole('textbox', { name: 'Body', exact: true })
  const headings = page.getByRole('textbox', {
    name: 'Block heading',
    exact: true,
  })
  await expect(body).toHaveText('Hello')
  await body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' existing edit')
  await headings.fill('Edited existing heading')
  await page.getByRole('button', { name: 'Add item', exact: true }).click()
  await page.getByRole('button', { name: 'Item #2', exact: true }).click()
  await page.getByRole('button', { name: 'Widget', exact: true }).click()
  await body.nth(1).click()
  await page.keyboard.type('New block text')
  await headings.nth(1).fill('New heading')
  await saveAndReload(page)
  await page.getByRole('button', { name: 'Expand all', exact: true }).click()
  await expect(body.first()).toHaveText('Hello existing edit')
  await expect(body.nth(1)).toHaveText('New block text')
  await expect(headings.first()).toHaveValue('Edited existing heading')
  await expect(headings.nth(1)).toHaveValue('New heading')
  await body.nth(1).click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' second save')
  await saveAndReload(page)
  await page.getByRole('button', { name: 'Expand all', exact: true }).click()
  await expect(body.first()).toHaveText('Hello existing edit')
  await expect(body.nth(1)).toHaveText('New block text second save')
  await page.getByRole('tab', { name: 'Source', exact: true }).nth(1).click()
  await page.getByRole('tab', { name: 'Source', exact: true }).first().click()
  await expect(
    page.getByRole('textbox', { name: 'Body source', exact: true }).first(),
  ).toHaveValue('Hello existing edit')
  await expect(
    page.getByRole('textbox', { name: 'Body source', exact: true }).nth(1),
  ).toHaveValue('New block text second save')
})

test('a new collection entry retains rich text when edited again as an existing entry', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/collection/posts/new')
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Persistence entry')
  const body = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(body).toBeVisible()
  await body.click()
  await page.keyboard.type('New entry body')
  await page.getByRole('button', { name: 'Create entry', exact: true }).click()
  await expect(page).toHaveURL(/entry\/content\/posts\/persistence-entry\.md$/)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(body).toHaveText('New entry body')
  await body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' existing entry edit')
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Updated entry title')
  await saveAndReload(page)
  await expect(body).toHaveText('New entry body existing entry edit')
  await expect(
    page.getByRole('textbox', { name: 'Title', exact: true }),
  ).toHaveValue('Updated entry title')
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Body source', exact: true }),
  ).toHaveValue('New entry body existing entry edit')
})

test('HTML rich text retains edits to existing content and an emptied field', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/html-editor')
  await page.waitForLoadState('networkidle')
  const body = page.getByRole('textbox', { name: 'HTML body', exact: true })
  await expect(body).toContainText('HTML title')
  await body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' existing HTML edit')
  await saveAndReload(page)
  await expect(body).toContainText('existing HTML edit')
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', {
    name: 'HTML body source',
    exact: true,
  })
  await expect(source).toHaveValue(/existing HTML edit/)
  await source.fill('')
  await page.getByRole('tab', { name: 'Editor', exact: true }).click()
  await expect(body).toHaveText('')
  await body.click()
  await page.keyboard.type('New HTML content')
  await saveAndReload(page)
  await expect(body).toHaveText('New HTML content')
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  await expect(source).toHaveValue('<p>New HTML content</p>')
})
