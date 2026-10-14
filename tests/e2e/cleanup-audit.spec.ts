import { expect, test } from './test'

const entry =
  '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'

test('Overview retains draft resume, recent entries, and create shortcuts', async ({
  page,
}) => {
  await page.goto(entry)
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Overview resume audit')
  await expect(
    page.getByText('Saved on this device', { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  const drafts = page.getByRole('table', { name: 'Local drafts', exact: true })
  await expect(drafts).toContainText('Overview resume audit')
  await expect(
    page.getByRole('table', { name: 'Recently opened', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('table', { name: 'Create an entry', exact: true })
      .getByRole('link', { name: 'Posts', exact: true }),
  ).toBeVisible()
  await drafts.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Title', exact: true }),
  ).toHaveValue('Overview resume audit')
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await drafts.getByRole('button', { name: 'Discard', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click()
  await expect(drafts).toHaveCount(0)
})

test('rich-text uploads over 1 MB with spaces in their filenames survive save/reload', async ({
  page,
}) => {
  await page.goto(entry)
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
    .getByRole('tablist', { name: 'Body mode' })
    .getByRole('tab', { name: 'Source', exact: true })
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

test('configured custom commit messages use a cancelable dialog with normal saves', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/configuration')
  const configuration = page.getByRole('textbox', {
    name: 'Pages CMS configuration',
    exact: true,
  })
  await configuration.fill(
    'settings:\n  commit:\n    allowCustomMessage: true\nmedia: public/images\ncontent:\n  - name: posts\n    type: collection\n    path: content/posts\n    fields:\n      - name: title\n        label: Title\n        type: string\n      - name: body\n        label: Body\n        type: rich-text\n',
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('Configuration saved', { exact: true }),
  ).toBeVisible()
  await page.goto(entry)
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

test('new entries retain distinct resumable drafts in the same collection', async ({
  page,
}) => {
  const newEntry = '/pagescms/fixture/main/collection/posts/new'
  await page.goto(newEntry)
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await title.fill('First new draft')
  await expect(
    page.getByText('Saved on this device', { exact: true }),
  ).toBeVisible()
  const first = page.url()
  expect(first).toContain('draft=')
  await page.goto(newEntry)
  await title.fill('Second new draft')
  await expect(
    page.getByText('Saved on this device', { exact: true }),
  ).toBeVisible()
  const second = page.url()
  expect(second).not.toBe(first)
  await page.goto(first)
  await expect(title).toHaveValue('First new draft')
  await page.goto(second)
  await expect(title).toHaveValue('Second new draft')
})
