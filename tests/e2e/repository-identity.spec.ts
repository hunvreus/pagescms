import { expect, test } from './test'

test('canonicalizes a renamed repository while retaining the entry and draft', async ({
  page,
}) => {
  const suffix = '/main/collection/posts/entry/content/posts/hello.md'
  await page.goto(
    `/github/previous-owner/previous-fixture${suffix}?identity=redirect#body`,
  )
  await expect(page).toHaveURL(
    new RegExp(`/github/pagescms/fixture${suffix}\\?identity=redirect#body$`),
  )
  const title = page.getByRole('textbox', { name: 'Title', exact: true })
  await expect(title).toBeVisible()
  await title.fill('Repository ID draft')
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  const drafts = page.getByRole('list', { name: 'Local drafts' })
  await expect(
    drafts.getByRole('link', { name: /Repository ID draft/ }),
  ).toBeVisible()
  await page.goto(`/github/previous-owner/previous-fixture${suffix}`)
  await expect(page).toHaveURL(new RegExp(`/github/pagescms/fixture${suffix}$`))
  await expect(title).toHaveValue('Repository ID draft')
})
