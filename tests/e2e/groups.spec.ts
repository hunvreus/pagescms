import { expect, test } from './test'

test('group headers avoid duplicate metadata and retain fields after opening', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  const sidebarHeader = page.locator('[data-slot="sidebar-header"]')
  await expect(
    sidebarHeader.getByRole('link', { name: 'All projects' }),
  ).toHaveCount(0)
  await expect(
    sidebarHeader.getByRole('link', { name: 'Settings', exact: true }),
  ).toHaveCount(0)
  await expect(
    page
      .locator('[data-slot="sidebar-content"]')
      .getByRole('link', { name: 'Settings', exact: true }),
  ).toHaveCount(0)
  await expect(
    page
      .locator('[data-slot="sidebar-content"]')
      .getByText('Admin', { exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Entry actions', exact: true }).click()
  const github = page.getByRole('menuitem', {
    name: 'View on GitHub',
    exact: true,
  })
  await expect(github).toHaveAttribute(
    'href',
    /github\.com\/pagescms\/fixture\/blob\/main\//,
  )
  await page.keyboard.press('Escape')
  const groups = page.locator('[data-slot="collapsible"]')
  const authors = groups.nth(0)
  const layout = groups.nth(1)
  const name = page.getByRole('textbox', { name: 'Full name', exact: true })
  await expect(name).toHaveCount(0)
  await authors.getByRole('button', { name: 'Item #1', exact: true }).click()
  await expect(name).toHaveValue('Ronan')
  await expect(name).toBeDisabled()
  await expect(authors.getByText('Readonly', { exact: true })).toHaveCount(0)
  await expect(authors.getByText('Required', { exact: true })).toHaveCount(1)
  await name.evaluate((node) => node.setAttribute('data-retained', 'yes'))
  await authors.getByRole('button', { name: 'Item #1', exact: true }).click()
  await expect(name).toBeHidden()
  await expect(page.locator('[data-retained="yes"]')).toHaveCount(1)
  await authors.getByRole('button', { name: 'Item #1', exact: true }).click()
  await expect(name).toHaveAttribute('data-retained', 'yes')
  await expect(layout.getByText('Widget', { exact: true })).toBeVisible()
  await layout.getByRole('button', { name: 'Item #1', exact: true }).click()
  const editor = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(editor).toContainText('Hello')
  await expect(layout.getByText('Required', { exact: true })).toHaveCount(0)
  await expect(layout.getByText('Widget', { exact: true })).toHaveCount(1)
  const clearBlock = layout.getByRole('button', {
    name: 'Reset block in item 1',
    exact: true,
  })
  await clearBlock.hover()
  await expect(
    page.getByRole('tooltip', { name: 'Reset block', exact: true }),
  ).toBeVisible()
  await clearBlock.click()
  await expect(page.getByRole('alertdialog')).toContainText('Reset this block?')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const remove = layout.getByRole('button', {
    name: 'Remove item 1',
    exact: true,
  })
  await remove.hover()
  await expect(
    page.getByRole('tooltip', { name: 'Remove item', exact: true }),
  ).toBeVisible()
  await remove.click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await editor.evaluate((node) =>
    node.setAttribute('data-editor-retained', 'yes'),
  )
  await layout.getByRole('button', { name: 'Item #1', exact: true }).click()
  await expect(editor).toBeHidden()
  await layout.getByRole('button', { name: 'Item #1', exact: true }).click()
  await expect(editor).toHaveAttribute('data-editor-retained', 'yes')
})

test('reset clears block fields while remove deletes the list item', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  const reset = page.getByRole('button', {
    name: 'Reset block in item 1',
    exact: true,
  })
  const remove = page.getByRole('button', {
    name: 'Remove item 1',
    exact: true,
  })
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await reset.click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Reset', exact: true })
    .click()
  await expect(reset).toHaveCount(0)
  await expect(remove).toBeVisible()
  await page
    .locator('[data-slot="collapsible"]')
    .nth(1)
    .getByRole('button', { name: 'Item #1', exact: true })
    .click()
  await expect(
    page.getByText('Choose a content block', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Widget', exact: true }).click()
  const body = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(body).toHaveText('')
  await body.fill('First replacement')
  await page.getByRole('button', { name: 'Add item', exact: true }).click()
  await page
    .locator('[data-slot="collapsible"]')
    .last()
    .getByRole('button', { name: 'Item #2', exact: true })
    .click()
  await page.getByRole('button', { name: 'Widget', exact: true }).click()
  await body.nth(1).fill('Second retained')
  await save.click()
  await expect(save).toBeDisabled()
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('button', { name: 'Remove item 2', exact: true }),
  ).toBeVisible()
  await remove.click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Remove item 2', exact: true }),
  ).toHaveCount(0)
  await save.click()
  await expect(save).toBeDisabled()
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('button', { name: 'Remove item 2', exact: true }),
  ).toHaveCount(0)
  await page
    .locator('[data-slot="collapsible"]')
    .nth(1)
    .getByRole('button', { name: 'Item #1', exact: true })
    .click()
  await expect(body).toHaveText('Second retained')
})
