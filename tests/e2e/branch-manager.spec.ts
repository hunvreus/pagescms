import { expect, test } from './test'

test('known branches stay usable while the branch list loads', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_serverFn/**', async (route) => {
    await pending
    await route.continue()
  })
  try {
    await page.getByRole('button', { name: /fixture main$/ }).click()
    const trigger = page.getByRole('menuitem', {
      name: 'Branch: main',
      exact: true,
    })
    await expect(trigger).not.toHaveAttribute('aria-busy', 'true')
    await expect(trigger.locator('.animate-spin')).toHaveCount(0)
    await trigger.hover()
    await expect(
      page.getByRole('menuitem', { name: 'All branches…' }),
    ).toBeVisible()
    await expect(
      page.getByRole('status', { name: 'Loading branches' }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: 'main', exact: true }).last(),
    ).toBeEnabled()
  } finally {
    release()
  }
  await expect(
    page.getByRole('status', { name: 'Loading branches' }),
  ).toHaveCount(0)
})

test('branch commands support filtering and keyboard navigation', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('link', { name: 'Configuration', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: /fixture main$/ }).click()
  const settings = page.getByRole('menuitem', {
    name: 'Configuration',
    exact: true,
  })
  await expect(settings).toHaveCount(0)
  await expect(
    page.getByRole('menuitem', { name: 'View on GitHub' }),
  ).not.toHaveAttribute('data-inset', 'true')
  await page
    .getByRole('menuitem', { name: 'Branch: main', exact: true })
    .hover()
  await page.getByRole('menuitem', { name: 'All branches…' }).click()
  const dialog = page.getByRole('dialog', { name: 'All branches' })
  await expect(
    dialog.getByRole('option').filter({ hasNotText: 'Create branch' }),
  ).toHaveCount(8)
  await expect(
    dialog.getByRole('option', { name: 'main', exact: true }),
  ).toBeVisible()
  const search = dialog.getByRole('combobox')
  await search.fill('preview')
  const branch = dialog.getByRole('option', { name: 'preview', exact: true })
  await expect(branch).toBeVisible()
  await search.press('ArrowDown')
  await search.press('Enter')
  await expect(page).toHaveURL(/\/fixture\/preview\//)
  await expect(dialog).toHaveCount(0)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /fixture preview$/ }).click()
  await page
    .getByRole('menuitem', { name: 'Branch: preview', exact: true })
    .hover()
  await page
    .getByRole('menuitem', { name: 'Create branch…', exact: true })
    .click()
  const creation = page.getByRole('dialog', {
    name: 'Create branch',
    exact: true,
  })
  await expect(
    creation.getByText('Create a branch from “preview”.', {
      exact: true,
    }),
  ).toBeVisible()
  const name = creation.getByRole('textbox', { name: 'Branch name' })
  const submit = creation.getByRole('button', {
    name: 'Create branch',
    exact: true,
  })
  await expect(submit).toBeDisabled()
  await name.fill('preview')
  await expect(submit).toBeDisabled()
  await name.fill('bad name')
  await expect(submit).toBeDisabled()
  await name.fill('new-search-branch')
  await expect(submit).toBeEnabled()
  await creation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(creation).toHaveCount(0)
})

test('branch creation confirms success and switches to the new branch', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /fixture main$/ }).click()
  await page
    .getByRole('menuitem', { name: 'Branch: main', exact: true })
    .hover()
  await page
    .getByRole('menuitem', { name: 'Create branch…', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Create branch',
    exact: true,
  })
  await dialog
    .getByRole('textbox', { name: 'Branch name' })
    .fill('toast-preview')
  await dialog
    .getByRole('button', { name: 'Create branch', exact: true })
    .click()
  await expect(
    page.getByText('Branch “toast-preview” created', { exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/toast-preview(?:\/|$)/)
})
