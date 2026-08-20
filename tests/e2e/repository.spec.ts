import { expect, test } from '@playwright/test'

test('navigates a repository and persists a structured entry update', async ({
  page,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Open a project' }),
  ).toBeVisible()
  await expect(page.getByText('fixture', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Open' }).click()

  await expect(
    page.getByRole('heading', { name: 'Choose content to edit' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Posts' }).click()
  await expect(page.getByText('Hello world', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Edit' }).click()
  await expect(page).toHaveURL(
    /\/pagescms\/fixture\/main\/collection\/posts\/entry\/content\/posts\/hello\.md$/,
  )

  const title = page.getByLabel('Title')
  await expect(title).toHaveValue('Hello world')
  await title.fill('Updated in Playwright')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()

  await page.reload()
  await expect(page.getByLabel('Title')).toHaveValue('Updated in Playwright')
})
