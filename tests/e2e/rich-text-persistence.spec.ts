import type { Page } from '@playwright/test'
import { expect, test } from './test'

const entry =
  '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'

async function saveAndReload(page: Page) {
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeEnabled()
  const response = page.waitForResponse(
    (result) =>
      result.url().includes('/api/entries/structured') &&
      result.request().method() === 'PATCH',
  )
  await save.click()
  expect((await response).ok()).toBe(true)
  await expect(save).toBeDisabled()
  await expect(save).toHaveAttribute('aria-busy', 'false')
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
  await page.goto('/github/pagescms/fixture/main/file/groups')
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
  await page.getByRole('radio', { name: 'Source', exact: true }).nth(1).click()
  await page.getByRole('radio', { name: 'Source', exact: true }).first().click()
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
  await page.goto('/github/pagescms/fixture/main/collection/posts/new')
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
  await page.getByRole('radio', { name: 'Source', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Body source', exact: true }),
  ).toHaveValue('New entry body existing entry edit')
})

test('HTML rich text retains edits to existing content and an emptied field', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/html-editor')
  await page.waitForLoadState('networkidle')
  const body = page.getByRole('textbox', { name: 'HTML body', exact: true })
  await expect(body).toContainText('HTML title')
  await body.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' existing HTML edit')
  await saveAndReload(page)
  await expect(body).toContainText('existing HTML edit')
  await page.getByRole('radio', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', {
    name: 'HTML body source',
    exact: true,
  })
  await expect(source).toHaveValue(/existing HTML edit/)
  await source.fill('')
  await page.getByRole('radio', { name: 'Editor', exact: true }).click()
  await expect(body).toHaveText('')
  await body.click()
  await page.keyboard.type('New HTML content')
  await saveAndReload(page)
  await expect(body).toHaveText('New HTML content')
  await page.getByRole('radio', { name: 'Source', exact: true }).click()
  await expect(source).toHaveValue('<p>New HTML content</p>')
})

test('rich-text uploads over 1 MB with spaces in their filenames survive save/reload', async ({
  page,
}) => {
  await page.goto(
    '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  const editor = page.getByRole('textbox', { name: 'Body', exact: true })
  await editor.click()
  await editor.evaluate((element) => {
    const bytes = new Uint8Array(1_100_000)
    bytes.set([137, 80, 78, 71])
    const data = new DataTransfer()
    data.items.add(
      new File([bytes], 'over one megabyte.png', { type: 'image/png' }),
    )
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'clipboardData', { value: data })
    element.dispatchEvent(event)
  })
  await expect(page.getByText('1 file uploaded', { exact: true })).toBeVisible()
  await expect(editor.locator('img[alt="over one megabyte.png"]')).toHaveCount(
    1,
  )
  await page
    .getByRole('radiogroup', { name: 'Body mode' })
    .getByRole('radio', { name: 'Source', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Body source', exact: true }),
  ).toHaveValue(/over%20one%20megabyte\.png/)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(editor.locator('img[alt="over one megabyte.png"]')).toHaveCount(
    1,
  )
})
