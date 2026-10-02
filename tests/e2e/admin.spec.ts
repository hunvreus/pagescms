import { expect, test } from '@playwright/test'

const repository = '/pagescms/fixture/main'

test('repository administration pages share one header and interaction pattern', async ({
  page,
}) => {
  await page.goto(`${repository}/cache`)
  await page.waitForLoadState('networkidle')

  const header = page.locator('[data-slot="repository-page-header"]')
  const cacheTable = page.getByRole('table', { name: 'Repository cache' })
  await expect(header.getByRole('heading', { name: 'Cache' })).toBeVisible()
  await expect(
    cacheTable.getByRole('columnheader', { name: 'Cache' }),
  ).toBeVisible()
  await expect(cacheTable.getByText('Content', { exact: true })).toBeVisible()
  await expect(
    cacheTable.getByText('Configuration', { exact: true }),
  ).toBeVisible()
  await expect(
    cacheTable.getByText('Permissions', { exact: true }),
  ).toBeVisible()

  await header.getByRole('button', { name: 'Clear cache' }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Clear all cached data?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.goto(`${repository}/actions`)
  await page.waitForLoadState('networkidle')
  await expect(header.getByRole('heading', { name: 'Actions' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Deploy site' })).toBeVisible()
  await page.getByRole('button', { name: 'Run' }).click()
  await expect(
    page.getByRole('alertdialog', { name: 'Deploy site?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.goto(`${repository}/collaborators`)
  await page.waitForLoadState('networkidle')
  await expect(
    header.getByRole('heading', { name: 'Collaborators' }),
  ).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible()
  await header.getByRole('button', { name: 'Invite collaborator' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Invite collaborators' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email addresses')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto(`${repository}/configuration`)
  await page.waitForLoadState('networkidle')
  await expect(
    header.getByRole('heading', { name: 'Configuration' }),
  ).toBeVisible()
  const editor = page.getByRole('textbox', {
    name: 'Pages CMS configuration',
  })
  await expect(editor).toContainText('content:')
  await expect(header.getByRole('button', { name: 'Save' })).toBeDisabled()

  await header.getByRole('button', { name: 'Configuration history' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByText('No history found.')).toBeVisible()
})
