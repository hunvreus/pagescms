import { expect, test } from './test'

for (const { name, locale, expectedPath } of [
  {
    name: 'nested',
    locale: '',
    expectedPath: 'content/new/nested/first-entry.md',
  },
  {
    name: 'localized',
    locale: 'fr',
    expectedPath: 'content/new/localized/first-entry.fr.md',
  },
]) {
  test(`creates the first entry in a missing ${name} collection`, async ({
    page,
  }) => {
    await page.goto('/github/pagescms/fixture/main/configuration')
    const configuration = page.getByRole('textbox', {
      name: 'Configuration',
      exact: true,
    })
    await configuration.fill(
      `i18n:\n  default: en\n  locales: [en, fr]\ncontent:\n  - name: nested\n    label: Nested\n    type: collection\n    path: content/new/nested\n    filename: '{primary}.md'\n    fields:\n      - name: title\n        label: Title\n        type: string\n  - name: localized\n    label: Localized\n    type: collection\n    path: content/new/localized\n    filename: '{primary}.md'\n    i18n:\n      scheme: files\n      path: { type: filename, position: suffix, default: omit }\n    fields:\n      - name: title\n        label: Title\n        type: string\n`,
    )
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      page.getByText('Configuration saved', { exact: true }),
    ).toBeVisible()

    await page.goto(
      `/github/pagescms/fixture/main/collection/${name}${locale ? `?locale=${locale}` : ''}`,
    )
    await expect(
      page.getByRole('columnheader', { name: /Title/ }),
    ).toBeVisible()
    await expect(page.getByText('No results.')).toBeVisible()
    await expect(page.getByText('Collection folder not found')).toHaveCount(0)
    await page.getByRole('link', { name: 'New entry', exact: true }).click()
    await page.getByLabel('Title').fill('First entry')
    await page
      .getByRole('button', { name: 'Create entry', exact: true })
      .click()
    await expect(page.getByText('File created', { exact: true })).toBeVisible()
    await page.goto(
      `/github/pagescms/fixture/main/collection/${name}${locale ? `?locale=${locale}` : ''}`,
    )
    const entry = page.getByRole('link', { name: 'First entry', exact: true })
    await expect(entry).toBeVisible()
    await expect(entry).toHaveAttribute(
      'href',
      new RegExp(expectedPath.replaceAll('.', '\\.')),
    )
    await entry.click()
    await expect(page.getByLabel('Title')).toHaveValue('First entry')
  })
}

for (const example of [
  {
    collection: 'bundles',
    title: 'About',
  },
  { collection: 'dated-posts', title: 'Hello' },
]) {
  test(`creates and reopens a French entry using the ${example.collection} filename template`, async ({
    page,
  }) => {
    const collection = `/github/pagescms/fixture/main/collection/${example.collection}?locale=fr`
    await page.goto(collection)
    const dated = example.collection === 'dated-posts'
    const newEntry = page.getByRole('link', { name: 'New entry', exact: true })
    if (dated) {
      await page.getByRole('link', { name: 'news', exact: true }).click()
      await expect(newEntry).toHaveAttribute(
        'href',
        /parent=hugo%2Fposts%2Fnews/,
      )
    }
    await newEntry.click()
    await page.getByLabel('Title', { exact: true }).fill(example.title)
    await page
      .getByRole('button', { name: 'Create entry', exact: true })
      .click()
    await expect(page.getByText('File created', { exact: true })).toBeVisible()
    await page.goto(collection)
    if (dated) {
      await page.getByRole('link', { name: 'news', exact: true }).click()
      await page.getByRole('link', { name: /^\d{4}$/ }).click()
      await page.getByRole('link', { name: /^(0[1-9]|1[0-2])$/ }).click()
    }
    const entry = page.getByRole('link', { name: example.title, exact: true })
    await expect(entry).toHaveAttribute(
      'href',
      dated
        ? /\/hugo\/posts\/news\/\d{4}\/\d{2}\/hello\.fr\.md\?/
        : /\/hugo\/pages\/about\/_index\.fr\.md\?/,
    )
    await entry.click()
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
      example.title,
    )
  })
}
