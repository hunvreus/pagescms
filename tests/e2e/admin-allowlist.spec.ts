import { expect, test } from './test'

for (const width of [390, 1280]) {
  test(`admin manages the sign-in allowlist at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin')
    const section = page.getByRole('region', {
      name: 'Sign-in access',
      exact: true,
    })
    await expect(section.getByText('No sign-in restrictions.')).toBeVisible()
    await section.getByRole('button', { name: 'Add rule' }).click()
    const add = page.getByRole('dialog', { name: 'Add rule' })
    await expect(add).toContainText('With no rules, anyone can sign in.')
    await add.evaluate((dialog) => {
      document.documentElement.dataset.dialogTitles = ''
      new MutationObserver(() => {
        document.documentElement.dataset.dialogTitles +=
          dialog.querySelector('[data-slot="dialog-title"]')?.textContent ?? ''
      }).observe(dialog, {
        childList: true,
        characterData: true,
        subtree: true,
      })
    })
    await page.keyboard.press('Escape')
    await expect(add).toBeHidden()
    expect(
      await page.evaluate(() => document.documentElement.dataset.dialogTitles),
    ).not.toContain('Bulk import')
    await section.getByRole('button', { name: 'Add rule' }).click()
    const rule = add.getByRole('group', { name: 'Sign-in rule' })
    const bounds = await rule.evaluate((group) => {
      const select = group
        .querySelector('[data-slot="select-trigger"]')!
        .getBoundingClientRect()
      const input = group
        .querySelector('[data-slot="input"]')!
        .getBoundingClientRect()
      return { gap: input.x - select.right, vertical: input.y - select.y }
    })
    expect(Math.abs(bounds.gap)).toBeLessThan(1)
    expect(Math.abs(bounds.vertical)).toBeLessThan(1)
    await expect(rule.getByRole('combobox', { name: 'Type' })).toHaveCSS(
      'border-top-right-radius',
      '0px',
    )
    await expect(rule.getByLabel('Rule', { exact: true })).toHaveCSS(
      'border-top-left-radius',
      '0px',
    )
    await add.getByLabel('Rule', { exact: true }).fill('editor@example.com')
    await add.getByRole('button', { name: 'Add rule' }).click()
    await expect(add).toBeHidden()
    await expect(
      section.getByRole('cell', { name: 'editor@example.com', exact: true }),
    ).toBeVisible()
    await section.getByRole('button', { name: 'Add rule' }).click()
    await add.getByRole('combobox', { name: 'Type' }).click()
    await page.getByRole('option', { name: 'Pattern' }).click()
    await add.getByLabel('Rule', { exact: true }).fill('(a+)+$')
    await add.getByRole('button', { name: 'Add rule' }).click()
    await expect(add.getByText('Enter a valid rule.')).toBeVisible()
    await add.getByLabel('Rule', { exact: true }).fill('.*@example\\.net')
    await add.getByRole('button', { name: 'Add rule' }).click()
    await expect(add).toBeHidden()
    await section
      .getByRole('button', { name: 'More sign-in access actions' })
      .click()
    await page.getByRole('menuitem', { name: 'Bulk import' }).click()
    const upload = page.getByRole('dialog', { name: 'Bulk import' })
    await expect(upload).toContainText('Existing rules are kept.')
    const addresses = upload.getByLabel('Email addresses')
    await addresses.fill('invalid')
    await addresses.press('Enter')
    await expect(
      upload.getByText('Enter a valid email address for each person'),
    ).toBeVisible()
    await upload.getByRole('button', { name: 'Remove invalid' }).click()
    await addresses.evaluate((input) => {
      const clipboardData = new DataTransfer()
      clipboardData.setData(
        'text/plain',
        'Alice Example <first@example.com>; "Doe, Jane" <second@example.com>, FIRST@example.com',
      )
      input.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData,
        }),
      )
    })
    await expect(
      upload.getByText('first@example.com', { exact: true }),
    ).toHaveCount(1)
    await expect(
      upload.getByText('second@example.com', { exact: true }),
    ).toHaveCount(1)
    await upload.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(upload).toBeHidden()
    await section.getByRole('textbox', { name: 'Search rules' }).fill('first@')
    await expect(
      section.getByRole('cell', { name: 'first@example.com', exact: true }),
    ).toBeVisible()
    const remove = section.getByRole('button', {
      name: 'Remove first@example.com',
    })
    await expect(remove).toHaveAttribute('data-variant', 'destructive')
    await remove.click()
    const confirm = page.getByRole('alertdialog', {
      name: 'Remove sign-in rule?',
    })
    const confirmRemove = confirm.getByRole('button', {
      name: 'Remove',
      exact: true,
    })
    await expect(confirmRemove).toHaveAttribute('data-variant', 'destructive')
    await confirmRemove.click()
    await expect(section.getByText('No matching sign-in rules.')).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

for (const width of [390, 1280]) {
  test(`allowlist keeps its table while loading and after an error at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/admin/allowlist**', async (route) => {
      await blocked
      await route.abort('failed')
    })
    await page.goto('/admin')
    const section = page.getByRole('region', {
      name: 'Sign-in access',
      exact: true,
    })
    const table = section.getByRole('table', { name: 'Sign-in access' })
    await expect(table).toHaveAttribute('aria-busy', 'true')
    await expect(
      table.getByRole('columnheader', { name: 'Type' }),
    ).toBeVisible()
    await expect(
      table.getByRole('columnheader', { name: 'Rule' }),
    ).toBeVisible()
    await expect(table.locator('[data-slot="skeleton"]')).toHaveCount(9)
    await expect(
      section.getByRole('button', { name: 'Add rule' }),
    ).toBeDisabled()
    const columns = () =>
      table.locator('thead th').evaluateAll((heads) =>
        heads.map((head) => {
          const { x, width: columnWidth } = head.getBoundingClientRect()
          return { x, width: columnWidth }
        }),
      )
    const before = await columns()
    release()
    await expect(table.getByRole('alert')).toHaveText(
      'Could not load sign-in rules.',
    )
    await expect(section.locator('[data-slot="alert"]')).toHaveCount(0)
    await expect(
      section.getByRole('button', { name: 'Add rule' }),
    ).toBeDisabled()
    expect(await columns()).toEqual(before)
    await page.unroute('**/api/admin/allowlist**')
    await table.getByRole('button', { name: 'Try again' }).click()
    await expect(table.getByText('No sign-in restrictions.')).toBeVisible()
    await expect(
      section.getByRole('button', { name: 'Add rule' }),
    ).toBeEnabled()
    expect(await columns()).toEqual(before)
  })
}

test('failed allowlist filtering retains the previous rules and offers retry', async ({
  page,
}) => {
  await page.goto('/admin')
  const section = page.getByRole('region', {
    name: 'Sign-in access',
    exact: true,
  })
  await section.getByRole('button', { name: 'Add rule' }).click()
  const add = page.getByRole('dialog', { name: 'Add rule' })
  await add.getByLabel('Rule', { exact: true }).fill('editor@example.com')
  await add.getByRole('button', { name: 'Add rule' }).click()
  await expect(add).toBeHidden()
  const table = section.getByRole('table', { name: 'Sign-in access' })
  await expect(
    table.getByRole('cell', { name: 'editor@example.com', exact: true }),
  ).toBeVisible()
  await page.route('**/api/admin/allowlist**', (route) => route.abort('failed'))
  await section.getByRole('textbox', { name: 'Search rules' }).fill('missing')
  await expect(table.getByRole('alert')).toHaveText(
    'Could not filter results. Previous results are still shown.',
  )
  await expect(
    table.getByRole('cell', { name: 'editor@example.com', exact: true }),
  ).toBeVisible()
  await page.unroute('**/api/admin/allowlist**')
  await table.getByRole('button', { name: 'Try again' }).click()
  await expect(table.getByText('No matching sign-in rules.')).toBeVisible()
})
