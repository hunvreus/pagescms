import { expect, test } from './test'

test('translation availability failure has an extra-small retry button in the header menu', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.route('**/api/entries/translations?**', (route) =>
    route.abort('failed'),
  )
  await page.goto('/github/pagescms/fixture/main/collection/languages')
  await page.getByRole('link', { name: 'Hello', exact: true }).click()
  await page.getByRole('button', { name: 'English', exact: true }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('alert')).toHaveText(
    'Could not check translations.',
  )
  const retry = menu.getByRole('menuitem', { name: 'Try again' })
  await expect(retry).toHaveAttribute('data-size', 'xs')
  await expect(retry).toHaveCSS('height', '24px')
  await page.screenshot({ path: testInfo.outputPath('translation-error.png') })
  await page.unroute('**/api/entries/translations?**')
  await retry.click()
  await expect(menu.getByRole('alert')).toHaveCount(0)
})

for (const collection of [
  { name: 'languages', english: 'Hello', french: 'Bonjour', path: '' },
  {
    name: 'folder-languages',
    english: 'About',
    french: 'À propos',
    path: 'content/folder-languages/guides',
  },
]) {
  test(`lists and opens entries in the selected language for ${collection.name}`, async ({
    page,
  }) => {
    const url = new URLSearchParams({ locale: '*' })
    if (collection.path) url.set('path', collection.path)
    await page.goto(
      `/github/pagescms/fixture/main/collection/${collection.name}?${url}`,
    )
    const language = page.getByRole('combobox', { name: 'Collection language' })
    await expect(language).toContainText('English')
    const english = page.getByRole('link', {
      name: collection.english,
      exact: true,
    })
    const french = page.getByRole('link', {
      name: collection.french,
      exact: true,
    })
    await expect(english).toBeVisible()
    await expect(french).toHaveCount(0)
    await language.click()
    await expect(page.getByRole('option')).toHaveCount(3)
    await page.getByRole('option', { name: 'French' }).click()
    await expect(french).toBeVisible()
    await expect(english).toHaveCount(0)
    await french.click()
    await expect(
      page.getByRole('button', { name: 'French', exact: true }),
    ).toBeVisible()
  })
}

test('a flat collection with parent language folders opens in German and remembers English', async ({
  page,
}) => {
  const path = '/github/pagescms/fixture/main/collection/generic-pages'
  await page.goto(path)
  const language = page.getByRole('combobox', { name: 'Collection language' })
  const german = page.getByRole('link', { name: 'Über uns', exact: true })
  const english = page.getByRole('link', { name: 'About us', exact: true })
  await expect(german).toBeVisible()
  await language.click()
  await expect(page.getByRole('option')).toHaveCount(2)
  await page.getByRole('option', { name: 'English' }).click()
  await expect(english).toBeVisible()
  await expect(german).toHaveCount(0)
  await page.goto(path)
  await expect(english).toBeVisible()
  await page.goto(path + '?locale=*')
  await expect(german).toBeVisible()
  await expect(english).toHaveCount(0)
})
