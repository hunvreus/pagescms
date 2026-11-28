import { expect, test } from './test'

const href = '/github/pagescms/fixture/main/file/regression-controls'
test('clearing a list cell preserves its row; validation opens nested items and focuses the error', async ({
  page,
}) => {
  await page.goto(href)
  const numbers = page.locator('[data-field-path="numbers"]')
  await expect(numbers.locator('input')).toHaveCount(2)
  await numbers.locator('input').first().fill('')
  await expect(numbers.locator('input')).toHaveCount(2)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(numbers.getByRole('alert')).toContainText('is empty')
  await expect(numbers.locator('input').first()).toBeFocused()
  await expect(page.getByLabel('Section title', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Section count', { exact: true })).toBeVisible()
  await expect(
    page.locator('[data-field-path="sections.0.title"]').getByRole('alert'),
  ).toContainText('is required')
  await expect(
    page.locator('[data-field-path="sections.0.count"]').getByRole('alert'),
  ).toContainText('is required')
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  await numbers.locator('input').first().fill('3')
  await page.getByLabel('Section title', { exact: true }).fill('Repaired')
  await page.getByLabel('Section count', { exact: true }).fill('0')
  await expect(page.getByLabel('Broken date', { exact: true })).toHaveValue(
    'invalid date',
  )
  await page.getByLabel('Broken date', { exact: true }).fill('2026-10-19')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(numbers.locator('input')).toHaveCount(2)
  await expect(numbers.locator('input').first()).toHaveValue('3')
})

test('nested multiple selection, saved reference labels and textarea limits survive save/reload', async ({
  page,
}) => {
  await page.goto(href)
  await expect(
    page.getByRole('combobox', { name: 'Legacy reference', exact: true }),
  ).toHaveValue('Hello world')
  const topics = page.locator('[data-field-path="nestedTopics.0"]')
  await expect(topics.locator('[data-slot="combobox-chip"]')).toHaveText([
    'News',
  ])
  await topics.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Guides', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Summary', { exact: true })).toHaveAttribute(
    'minlength',
    '3',
  )
  await expect(page.getByLabel('Summary', { exact: true })).toHaveAttribute(
    'maxlength',
    '30',
  )
  await page.getByLabel('Broken date', { exact: true }).fill('2026-10-19')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByLabel('Section title', { exact: true }).fill('Repaired')
  await page.getByLabel('Section count', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(topics.locator('[data-slot="combobox-chip"]')).toHaveText([
    'News',
    'Guides',
  ])
  await expect(
    page.getByRole('combobox', { name: 'Legacy reference', exact: true }),
  ).toHaveValue('Hello world')
})

test('uploading another file preserves repeated existing selections when unique is false', async ({
  page,
}) => {
  await page.goto(href)
  const field = page.locator('[data-field-path="files"]')
  await expect(
    field.getByRole('button', {
      name: 'Remove public/images/parity-a.txt',
      exact: true,
    }),
  ).toHaveCount(2)
  await field.locator('input[type="file"]').setInputFiles({
    name: 'new-parity.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('upload'),
  })
  await expect(
    field.getByRole('button', {
      name: 'Remove public/images/new-parity.txt',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    field.getByRole('button', {
      name: 'Remove public/images/parity-a.txt',
      exact: true,
    }),
  ).toHaveCount(2)
})

test('partial upload failure preserves existing duplicates and confirmed new files', async ({
  page,
}) => {
  await page.goto(href)
  await page.waitForLoadState('networkidle')
  let posts = 0
  await page.route('**/api/media/{files,uploads}', async (route) => {
    if (route.request().method() === 'POST' && ++posts === 3)
      await route.fulfill({
        status: 500,
        body: 'Simulated second-file initiation failure',
      })
    else await route.continue()
  })
  const field = page.locator('[data-field-path="files"]')
  await field.locator('input[type="file"]').setInputFiles([
    {
      name: 'partial-first.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('first'),
    },
    {
      name: 'partial-second.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('second'),
    },
  ])
  await expect(
    page.getByText('1 of 2 files uploaded', { exact: true }),
  ).toBeVisible()
  await expect(
    field.getByRole('button', {
      name: 'Remove public/images/parity-a.txt',
      exact: true,
    }),
  ).toHaveCount(2)
  await expect(
    field.getByRole('button', {
      name: 'Remove public/images/partial-first.txt',
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    field.getByRole('button', {
      name: 'Remove public/images/partial-second.txt',
      exact: true,
    }),
  ).toHaveCount(0)
})

test('server validation after a configuration change stays inline without duplicate failure toasts', async ({
  page,
  context,
}) => {
  const { configuration } = await import('./github-fixture.server')
  await page.goto(
    '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await page.getByLabel('Title', { exact: true }).fill('')
  const config = await context.newPage()
  await config.goto(
    '/github/pagescms/fixture/main/configuration?edit=configuration',
  )
  const source = config.getByRole('textbox', {
    name: 'Configuration',
  })
  await expect(source).toContainText('content:')
  await source.fill(
    configuration.replace(
      'label: Title\n        type: string',
      'label: Title\n        type: string\n        required: true',
    ),
  )
  await config.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    config.getByText('Configuration saved', { exact: true }),
  ).toBeVisible()
  // This editor still has the old schema, so only the server knows Title is required.
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.locator('[data-field-path="title"]').getByRole('alert'),
  ).toHaveText('title is required')
  await expect(page.getByLabel('Title', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  await page.getByLabel('Title', { exact: true }).fill('Repaired on server')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('File saved', { exact: true })).toBeVisible()
})

test('server errors for fields absent from the loaded form remain visible', async ({
  page,
  context,
}) => {
  const { configuration } = await import('./github-fixture.server')
  await page.goto(
    '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await page.getByLabel('Title', { exact: true }).fill('An unsaved edit')
  const config = await context.newPage()
  await config.goto(
    '/github/pagescms/fixture/main/configuration?edit=configuration',
  )
  const source = config.getByRole('textbox', {
    name: 'Configuration',
  })
  await expect(source).toContainText('content:')
  await source.fill(
    configuration.replace(
      'label: Title\n        type: string',
      'label: Title\n        type: string\n      - name: hiddenRequired\n        type: string\n        hidden: true\n        required: true',
    ),
  )
  await config.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    config.getByText('Configuration saved', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'hiddenRequired is required',
  )
  await expect(page.locator('[data-field-path="hiddenRequired"]')).toHaveCount(
    0,
  )
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
    'An unsaved edit',
  )
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})
