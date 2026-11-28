import { expect, test } from './test'
import type { Locator } from '@playwright/test'

const entry =
  '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
const headerSelector = '[data-slot="repository-page-header"]'
test.setTimeout(60_000)

async function expectCenteredIcon(control: Locator) {
  await expect(control).toBeVisible()
  const button = (await control.boundingBox())!
  const icon = (await control.locator('svg:visible').boundingBox())!
  expect(
    Math.abs(button.x + button.width / 2 - icon.x - icon.width / 2),
  ).toBeLessThan(1)
  expect(
    Math.abs(button.y + button.height / 2 - icon.y - icon.height / 2),
  ).toBeLessThan(1)
}

test('bold shortcuts leave the sidebar alone and the editor can apply bold', async ({
  page,
}) => {
  await page.goto(entry)
  const body = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(body).toBeVisible()
  const sidebar = page.locator('[data-slot="sidebar"][data-state]')
  await expect(sidebar).toHaveAttribute('data-state', 'expanded')
  await body.focus()
  await page.keyboard.press('Meta+b')
  await expect(sidebar).toHaveAttribute('data-state', 'expanded')
  await body.press('Control+End')
  await body.press('Control+b')
  await page.keyboard.type('Bold shortcut')
  await expect(body.locator('strong')).toContainText('Bold shortcut')
  await expect(sidebar).toHaveAttribute('data-state', 'expanded')
})

for (const width of [320, 390, 767]) {
  test(`mobile repository pages share one compact header at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(entry)
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByRole('textbox', { name: 'Title', exact: true }),
    ).toBeVisible()
    const header = page.locator(headerSelector)
    const toggle = header.getByRole('button', {
      name: 'Toggle Sidebar',
      exact: true,
    })
    const current = header.locator('[data-slot="breadcrumb-page"]')
    await expect(toggle).toBeVisible()
    await expect(current).toBeVisible()
    const back = header.getByRole('link', {
      name: 'Posts',
      exact: true,
    })
    await expect(back).toBeVisible()
    const titleBox = (await current.boundingBox())!
    const toggleBox = (await toggle.boundingBox())!
    expect(
      Math.abs(
        titleBox.y + titleBox.height / 2 - toggleBox.y - toggleBox.height / 2,
      ),
    ).toBeLessThan(2)
    const headerBox = (await header.boundingBox())!
    expect(headerBox.y).toBe(0)
    expect(headerBox.height).toBeLessThanOrEqual(52)
    const controls = header.locator('[data-slot="repository-header-actions"]')
    await expect(controls.getByRole('button')).toHaveCount(3)
    await expect(
      controls.getByRole('button', { name: 'Save', exact: true }),
    ).toBeVisible()
    await expect(
      controls.getByRole('button', { name: 'Entry actions', exact: true }),
    ).toBeVisible()
    await expect(
      header.getByRole('button', { name: 'Entry history', exact: true }),
    ).toBeVisible()
    await header
      .getByRole('button', { name: 'Entry history', exact: true })
      .click()
    await expect(
      page
        .getByRole('group', { name: 'History entries' })
        .or(page.getByText('No history found.')),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await toggle.click()
    const sidebar = page.getByRole('dialog', { name: 'Sidebar' })
    await expect(sidebar).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sidebar).toBeHidden()
    await page
      .getByRole('textbox', { name: 'Title', exact: true })
      .fill('A local draft')
    await expect(
      header.getByRole('button', { name: /^Local draft:/ }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await back.click()
    await expect(page).toHaveURL(/\/collection\/posts(?:\?locale=)?$/)
    const search = header.getByRole('textbox', { name: 'Search collection' })
    await expect(search).toBeVisible()
    await expect(search.locator('..')).toHaveAttribute(
      'data-slot',
      'input-group',
    )
    const create = header.getByRole('link', { name: 'New entry', exact: true })
    await expect(create).toHaveCSS('width', '32px')
    await expectCenteredIcon(create)
    const collectionSearchBox = (await search.boundingBox())!
    const collectionToggleBox = (await toggle.boundingBox())!
    const searchGap =
      collectionSearchBox.y - collectionToggleBox.y - collectionToggleBox.height

    for (const path of [
      'media/default',
      'collaborators',
      'actions',
      'configuration',
      'cache',
      '',
    ]) {
      await page.goto(`/github/pagescms/fixture/main/${path}`)
      await expect(header).toHaveCount(1)
      await expect(header).toBeVisible()
      await expect(toggle).toBeVisible()
      const row = await toggle.boundingBox()
      expect(row!.y).toBeLessThan(15)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await expect(
        header.locator('[data-slot="repository-header-toolbar"]:visible'),
      ).toHaveCount(0)
      await expect(
        header.locator(
          'input:not([type="file"]):visible, [role="combobox"]:visible',
        ),
      ).toHaveCount(0)
      await expect
        .poll(async () => (await header.boundingBox())?.height ?? Infinity)
        .toBeLessThanOrEqual(52)
      if (path === 'collaborators') {
        const search = page.getByRole('textbox', {
          name: 'Search collaborators',
        })
        await expect(search).toBeVisible()
        const searchBox = (await search.boundingBox())!
        const currentToggle = (await toggle.boundingBox())!
        expect(
          Math.abs(
            searchBox.y - currentToggle.y - currentToggle.height - searchGap,
          ),
        ).toBeLessThan(2)
        await search.fill('nobody matches this')
        await expect(search).toHaveValue('nobody matches this')
        await expectCenteredIcon(
          header.getByRole('button', { name: 'Invite collaborator' }),
        )
      }
      if (path === 'actions') {
        const run = header.getByRole('button', { name: 'Run', exact: true })
        await expect(run).toBeEnabled()
        await expect(
          header.getByRole('button', { name: 'Refresh action runs' }),
        ).toBeVisible()
        await expect(
          page.getByRole('textbox', { name: 'Search action runs' }),
        ).toBeVisible()
        const filter = page.getByRole('combobox', {
          name: 'Filter runs by action',
        })
        await expect(filter).toBeEnabled()
        const searchBox = await page
          .getByRole('textbox', { name: 'Search action runs' })
          .boundingBox()
        const filterBox = await filter.boundingBox()
        expect(Math.abs(searchBox!.y - filterBox!.y)).toBeLessThan(1)
        const currentToggle = (await toggle.boundingBox())!
        expect(
          Math.abs(
            searchBox!.y - currentToggle.y - currentToggle.height - searchGap,
          ),
        ).toBeLessThan(2)
        await filter.click()
        await page
          .getByRole('option', { name: 'Deploy site', exact: true })
          .click()
        await expect(filter).toContainText('Deploy site')
        await expectCenteredIcon(run)
        if (width === 390) {
          await page.screenshot({
            path: testInfo.outputPath('mobile-actions.png'),
          })
        }
      }
      if (path === 'media/default') {
        await expectCenteredIcon(
          header.getByRole('button', { name: 'Upload', exact: true }),
        )
      }
      if (path === 'cache') {
        await expectCenteredIcon(
          header.getByRole('button', { name: 'Clear all', exact: true }),
        )
      }
      if (path === 'configuration') {
        await expect(
          header.getByRole('button', { name: 'Entry history', exact: true }),
        ).toBeVisible()
        await header
          .getByRole('button', { name: 'Entry history', exact: true })
          .click()
        await expect(
          page
            .getByRole('group', { name: 'History entries' })
            .or(page.getByText('No history found.')),
        ).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(
          header
            .locator('[data-slot="repository-header-actions"]')
            .getByRole('button'),
        ).toHaveCount(3)
      }
    }
    await page.goto(
      '/github/pagescms/fixture/main/media/default?path=public%2Fimages%2FLibrary',
    )
    await expect(page.getByText('nested.svg', { exact: true })).toBeVisible()
    await header.getByRole('button', { name: 'Media', exact: true }).click()
    await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
  })
}

test('mobile workflow menu keeps confirmations, inputs and focus restoration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/github/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  const run = page
    .locator(headerSelector)
    .getByRole('button', { name: 'Entry actions', exact: true })
  await run.click()
  await page
    .getByRole('menuitem', { name: 'Confirm workflow', exact: true })
    .click()
  const confirmation = page.getByRole('alertdialog', {
    name: 'Deploy site?',
    exact: true,
  })
  await expect(confirmation).toBeVisible()
  await confirmation
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await expect(run).toBeFocused()
  await run.click()
  await page
    .getByRole('menuitem', { name: 'Test action inputs', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Run input test?',
    exact: true,
  })
  await expect(
    dialog.getByRole('textbox', { name: /^Action title/ }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(run).toBeFocused()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let held = false
  await page.route('**/api/action-runs', async (route) => {
    if (route.request().method() === 'POST' && !held) {
      held = true
      await gate
    }
    await route.continue()
  })
  await run.click()
  await page
    .getByRole('menuitem', { name: 'Run immediately', exact: true })
    .click()
  await expect(run).toHaveAttribute('aria-busy', 'true')
  await expect(run).toBeDisabled()
  release()
  await expect(run).toHaveAttribute('aria-busy', 'false')
  await expect(run).toBeEnabled()
})

test('desktop keeps repository search, filters and editor history', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/collection/posts')
  await page.waitForLoadState('networkidle')
  const header = page.locator(headerSelector)
  const search = header.getByRole('textbox', { name: 'Search collection' })
  await expect(search).toBeVisible()
  await search.fill('no matching entry')
  await expect(page.getByText('No results.', { exact: true })).toBeVisible()
  await page.goto('/github/pagescms/fixture/main/actions')
  await expect(
    header.getByRole('combobox', { name: 'Filter runs by action' }),
  ).toBeVisible()
  await page.goto(entry)
  await expect(
    header.getByRole('button', { name: 'Entry history', exact: true }),
  ).toBeVisible()
  await expect(
    header.getByRole('button', { name: 'Test entry action', exact: true }),
  ).toBeVisible()
})

test('long multilingual collection paths collapse to fit the content pane', async ({
  page,
}, testInfo) => {
  const first = 'Multilingual'
  const middle = 'Separate translation files'
  const current = 'Prefix · default omitted for translated entries'
  await page.route('**/api/collections?**', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    data.collection.groupTrail = [
      { name: 'multilingual', label: first },
      { name: 'separate', label: middle },
    ]
    data.collection.label = current
    await route.fulfill({ response, json: data })
  })
  await page.setViewportSize({ width: 1920, height: 844 })
  await page.goto('/github/pagescms/fixture/main/collection/languages')
  const header = page.locator(headerSelector)
  const trail = header.getByRole('navigation', { name: 'breadcrumb' })
  await expect(trail.getByText(middle, { exact: true })).toBeVisible()
  const overflow = trail.getByRole('button', { name: 'Show hidden segments' })
  await header.screenshot({ path: testInfo.outputPath('wide-header.png') })
  const filter = header.getByRole('textbox', { name: 'Search collection' })
  const group = filter.locator('..')
  await expect(group).toHaveAttribute('data-slot', 'input-group')
  await group.locator('[data-slot=input-group-addon]').click()
  await expect(filter).toBeFocused()
  for (const width of [980, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(overflow).toBeVisible()
    await expect(trail.getByText(first, { exact: true })).toBeVisible()
    await expect(trail.getByText(current, { exact: true })).toHaveCSS(
      'white-space',
      'nowrap',
    )
    await overflow.click()
    await expect(page.getByRole('menu').getByText(middle)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(overflow).toBeFocused()
    const bounds = (await trail.boundingBox())!
    const search = (await group.boundingBox())!
    expect(search.y).toBeGreaterThanOrEqual(bounds.y + bounds.height)
    const locale = header.getByRole('combobox', { name: 'Collection language' })
    await expect(locale).toHaveCSS('width', '32px')
    expect((await locale.boundingBox())!.x).toBeGreaterThanOrEqual(
      bounds.x + bounds.width - 1,
    )
    await expect(trail.locator('[data-slot=breadcrumb-page]')).toHaveCSS(
      'text-overflow',
      'ellipsis',
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await header.screenshot({ path: testInfo.outputPath('narrow-header.png') })
  await header.getByRole('combobox', { name: 'Collection language' }).click()
  await page.getByRole('option', { name: 'French' }).click()
  await expect(page).toHaveURL(/locale=fr/)
  await page.waitForLoadState('networkidle')

  await page.goto(
    '/github/pagescms/fixture/main/collection/folder-languages?locale=en&path=content%2Ffolder-languages%2Fguides',
  )
  await overflow.click()
  await page
    .getByRole('menuitem', { name: current, exact: true })
    .press('Enter')
  await expect
    .poll(() => new URL(page.url()).searchParams.get('path'))
    .toBeNull()
  expect(new URL(page.url()).searchParams.get('locale')).toBe('en')
  await expect(trail.locator('[aria-current=page]')).toHaveText(current)
  await page.unrouteAll({ behavior: 'wait' })
})
