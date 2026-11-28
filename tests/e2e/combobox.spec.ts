import { eq } from 'drizzle-orm'
import { createDatabase } from '#/server/db/client'
import { collaboratorTable } from '#/server/db/schema'
import { expect, test } from './test'

const repository = '/github/pagescms/fixture/main'

test('a reference loading failure offers an extra-small retry button', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.route('**/api/references', (route) => route.abort('failed'))
  await page.goto(`${repository}/file/selection-controls`)
  const input = page.getByRole('combobox', {
    name: 'Related post',
    exact: true,
  })
  const field = input.locator('xpath=ancestor::*[@data-slot="field"][1]')
  await input.scrollIntoViewIfNeeded()
  await expect(field.getByRole('alert')).toHaveText(
    'Could not load references.',
  )
  const retry = field.getByRole('button', { name: 'Try again' })
  await expect(retry).toHaveAttribute('data-size', 'xs')
  await expect(retry).toHaveAttribute('data-variant', 'outline')
  await page.screenshot({ path: testInfo.outputPath('reference-error.png') })
  await page.unroute('**/api/references')
  await retry.click()
  await expect(field.getByRole('alert')).toHaveCount(0)
})

test('select comboboxes search, enforce limits, support keyboard selection and save values', async ({
  page,
}) => {
  await page.goto(`${repository}/file/selection-controls`)
  const status = page.getByRole('combobox', {
    name: 'Selection status',
    exact: true,
  })
  await expect(status).toHaveValue('Draft')
  await status.fill('Pub')
  await expect(
    page.getByRole('option', { name: 'Published', exact: true }),
  ).toBeVisible()
  await status.press('ArrowDown')
  await status.press('Enter')
  await expect(status).toHaveValue('Published')
  const topics = page.getByRole('combobox', { name: 'Topics', exact: true })
  const field = topics.locator('..')
  await expect(field.locator('[data-slot="combobox-chip"]')).toHaveText([
    'News',
  ])
  await topics.click()
  await expect(
    page.getByRole('option', { name: 'News', exact: true }),
  ).toBeDisabled()
  await page.getByRole('option', { name: 'Guides', exact: true }).click()
  await expect(field.locator('[data-slot="combobox-chip"]')).toHaveText([
    'News',
    'Guides',
  ])
  await expect(
    page.getByRole('option', { name: 'Reviews', exact: true }),
  ).toBeDisabled()
  await topics.press('Escape')
  await field
    .locator('[data-slot="combobox-chip"]')
    .filter({ hasText: 'News' })
    .getByRole('button')
    .click()
  await expect(field.locator('[data-slot="combobox-chip"]')).toHaveText([
    'Guides',
  ])
  await topics.press('Escape')
  await expect(
    page.getByRole('combobox', { name: 'Locked topics', exact: true }),
  ).toHaveAttribute('readonly')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toHaveAttribute('aria-busy', 'false')
  await page.reload()
  await expect(status).toHaveValue('Published')
  await expect(field.locator('[data-slot="combobox-chip"]')).toHaveText([
    'Guides',
  ])
})

test('references resolve selected labels, search remotely and retain other selections', async ({
  page,
}) => {
  await page.goto(`${repository}/file/selection-controls`)
  const single = page.getByRole('combobox', {
    name: 'Related post',
    exact: true,
  })
  await expect(single).toHaveValue('hello.md')
  await single.fill('unchanged')
  await page.getByRole('option', { name: 'unchanged.md', exact: true }).click()
  await expect(single).toHaveValue('unchanged.md')
  const multiple = page.getByRole('combobox', {
    name: 'Related posts',
    exact: true,
  })
  const chips = multiple.locator('..').locator('[data-slot="combobox-chip"]')
  await expect(chips).toHaveText(['hello.md'])
  await multiple.fill('unchanged')
  await page.getByRole('option', { name: 'unchanged.md', exact: true }).click()
  await expect(chips).toHaveText(['hello.md', 'unchanged.md'])
  await multiple.press('Escape')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toHaveAttribute('aria-busy', 'false')
  await page.reload()
  await expect(single).toHaveValue('unchanged.md')
  await expect(chips).toHaveText(['hello.md', 'unchanged.md'])
})

test('recipient chips keep validation in the dialog and never submit on Enter', async ({
  page,
}) => {
  const database = createDatabase({ url: process.env.E2E_DATABASE_URL! })
  const [member] = await database
    .insert(collaboratorTable)
    .values({
      type: 'github',
      installationId: 1,
      ownerId: 1,
      repoId: 1,
      owner: 'pagescms',
      repo: 'fixture',
      email: 'existing@example.com',
    })
    .returning({ id: collaboratorTable.id })
  try {
    await page.goto(`${repository}/collaborators`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('note')).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Invite collaborator', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Invite collaborators' })
    await expect(dialog).toBeVisible()
    const input = dialog.getByLabel('Email addresses', { exact: true })
    await input.fill('Existing Person <EXISTING@example.com>')
    await input.press('Enter')
    await expect(dialog.locator('[data-slot="combobox-chip"]')).toHaveText([
      'existing@example.com',
    ])
    await expect(dialog).toBeVisible()
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Send invitations' }).click()
    await expect(dialog.locator('[data-slot="field-error"]')).toHaveText(
      'existing@example.com is already a collaborator',
    )
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(
      page.getByText('existing@example.com is already a collaborator'),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Invite collaborator', exact: true })
      .click()
    await expect(dialog.locator('[data-slot="field-error"]')).toHaveCount(0)
    await dialog
      .locator('[data-slot="combobox-chip"]')
      .getByRole('button')
      .click()
    await input.fill('invalid')
    await input.press('Enter')
    await expect(dialog.locator('[data-slot="field-error"]')).toContainText(
      'valid email',
    )
    await expect(input).toHaveAttribute('aria-invalid', 'true')
  } finally {
    await database
      .delete(collaboratorTable)
      .where(eq(collaboratorTable.id, member.id))
  }
})

test('pasting recipients creates normalized removable chips and deduplicates them', async ({
  page,
}) => {
  await page.goto(`${repository}/collaborators`)
  await page.waitForLoadState('networkidle')
  await page
    .getByRole('button', { name: 'Invite collaborator', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Invite collaborators' })
  const input = dialog.getByLabel('Email addresses', { exact: true })
  await input.evaluate((element) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData(
      'text/plain',
      'Alice Smith <ALICE@example.com>, "Bob, Smith" <bob@example.com>; alice@example.com',
    )
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(dialog.locator('[data-slot="combobox-chip"]')).toHaveText([
    'alice@example.com',
    'bob@example.com',
  ])
  await input.focus()
  await input.press('Backspace')
  await expect(dialog.locator('[data-slot="combobox-chip"]')).toHaveCount(1)
  expect(
    await input.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('none')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(dialog).toBeVisible()
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await expect(dialog).toBeVisible()
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})
