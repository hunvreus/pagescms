import { expect, test } from './test'

test('titles follow client navigation and use configured labels and entry paths', async ({
  page,
}) => {
  const response = await page.request.get('/pagescms/fixture/main/file/groups')
  expect(await response.text()).toContain(
    '<title>Groups - pagescms/fixture@main | Pages CMS</title>',
  )
  await page.goto('/')
  await expect(page).toHaveTitle('Projects | Pages CMS')
  await page
    .locator('a[href="/pagescms/fixture/main"]', { hasText: 'Open' })
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
  await page.goBack()
  await expect(page).toHaveTitle('Posts - pagescms/fixture@main | Pages CMS')
  await page.goto('/pagescms/fixture/main/collection/posts/new')
  await expect(page).toHaveTitle(
    'New entry | Posts - pagescms/fixture@main | Pages CMS',
  )
  await page.goto('/pagescms/fixture/main/file/groups')
  await expect(page).toHaveTitle('Groups - pagescms/fixture@main | Pages CMS')
  await page.goto('/pagescms/fixture/main/media/default')
  await expect(page).toHaveTitle(
    'Media | default - pagescms/fixture@main | Pages CMS',
  )
  await page.goto('/pagescms/fixture/main/cache')
  await expect(page).toHaveTitle('Cache - pagescms/fixture@main | Pages CMS')
  await page.goto('/settings')
  await expect(page).toHaveTitle('Settings | Pages CMS')
})
