import { expect, test } from './test'
import type { Page, Route } from '@playwright/test'

const entry = '/pagescms/fixture/main/file/merge-review'
const field = (page: Page, name: string) =>
  page.getByRole('textbox', { name, exact: true })
const save = (page: Page) =>
  page.getByRole('button', { name: 'Save', exact: true }).click()
const review = (page: Page) =>
  page.getByRole('dialog', {
    name: /Some changes need your review|Your changes are ready to combine|Choose which version to keep/,
  })

test.setTimeout(90_000)

test('nested field choices save directly while preserving disjoint changes', async ({
  page,
  browser,
  context,
  isolation,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(entry)
  await page.waitForLoadState('networkidle')
  const editorWidth = await field(page, 'Title').evaluate((input) => {
    const editor = input.closest('.max-w-3xl')!
    return parseFloat(getComputedStyle(editor).maxWidth)
  })
  await field(page, 'Title').fill('My title')
  await field(page, 'Author name').fill('My author')
  const remoteContext = await browser.newContext({
    storageState: await context.storageState(),
    extraHTTPHeaders: { 'x-pagescms-e2e-scope': isolation.scope },
  })
  try {
    const remote = await remoteContext.newPage()
    await remote.goto(new URL(entry, page.url()).href)
    await remote.waitForLoadState('networkidle')
    await field(remote, 'Title').fill('Latest title')
    await field(remote, 'Published').fill('Updated date')
    await field(remote, 'Author email').fill('saved@example.com')
    await save(remote)
    await expect(remote.getByText('File saved', { exact: true })).toBeVisible()
    await save(page)
    await expect(review(page)).toBeVisible()
    await expect(review(page).getByRole('heading')).toHaveCSS(
      'font-size',
      '16px',
    )
    await expect
      .poll(async () => {
        const bounds = await review(page).boundingBox()
        return bounds && Math.round(bounds.width)
      })
      .toBe(editorWidth * 2)
    const bounds = (await review(page).boundingBox())!
    expect(Math.abs(bounds.x + bounds.width / 2 - 960)).toBeLessThan(1)
    await expect(review(page)).toContainText('1 field needs your review')
    await expect(review(page)).not.toContainText('GitHub')
    await expect(
      review(page).getByText('Original value', { exact: true }),
    ).toHaveCount(0)
    await expect(
      review(page).getByRole('button', {
        name: 'Use latest saved version',
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(
      review(page)
        .locator('[data-merge-headings]')
        .getByRole('button', { name: 'Use all my changes' }),
    ).toBeVisible()
    await expect(review(page).getByRole('region')).toHaveCount(1)
    await expect(
      review(page).getByRole('region', { name: 'Title', exact: true }),
    ).toBeVisible()
    await expect(
      review(page).getByRole('button', { name: 'Save changes' }),
    ).toBeDisabled()
    const columns = review(page).locator('[data-merge-choices] > div')
    const mine = await columns.nth(0).boundingBox(),
      theirs = await columns.nth(1).boundingBox()
    expect(theirs!.x).toBeGreaterThan(mine!.x)
    expect(Math.abs(theirs!.y - mine!.y)).toBeLessThan(2)
    await expect(
      review(page).getByText('Your changes', { exact: true }),
    ).toHaveCount(1)
    await expect(
      review(page).getByText('Latest saved version', { exact: true }),
    ).toHaveCount(1)
    for (const value of await review(page).locator('[data-merge-value]').all())
      await expect(value).toHaveCSS('opacity', '1')
    const radioBounds = (await columns.nth(0).getByRole('radio').boundingBox())!
    const fieldBounds = (await columns
      .nth(0)
      .getByRole('textbox')
      .boundingBox())!
    expect(radioBounds.x + radioBounds.width).toBeLessThan(fieldBounds.x)
    const headings = review(page).locator('[data-merge-headings]')
    for (const [index, label] of [
      'Your changes',
      'Latest saved version',
    ].entries()) {
      const headingBounds = (await headings
        .getByText(label, { exact: true })
        .boundingBox())!
      const inputBounds = (await columns
        .nth(index)
        .getByRole('textbox')
        .boundingBox())!
      const columnBounds = (await columns.nth(index).boundingBox())!
      const columnRadio = (await columns
        .nth(index)
        .getByRole('radio')
        .boundingBox())!
      expect(Math.abs(headingBounds.x - columnBounds.x)).toBeLessThan(1)
      expect(Math.abs(headingBounds.x - columnRadio.x)).toBeLessThan(1)
      expect(headingBounds.x).toBeLessThan(inputBounds.x)
    }
    const headingBounds = (await headings.boundingBox())!
    const rowBounds = (await review(page).getByRole('region').boundingBox())!
    expect(headingBounds.x).toBe(rowBounds.x)
    expect(headingBounds.width).toBe(rowBounds.width)
    expect(headingBounds.x).toBeGreaterThan(bounds.x)
    await review(page)
      .getByRole('radio', { name: /Use my changes$/ })
      .click()
    await expect(
      review(page)
        .getByRole('group', { name: 'Title: Your changes', exact: true })
        .locator('input'),
    ).toHaveCSS('opacity', '1')
    await expect(columns.nth(1).locator('[data-merge-value]')).toHaveCSS(
      'opacity',
      '0.5',
    )
    await expect(columns.nth(1).getByRole('radio')).toHaveCSS('opacity', '1')
    const selected = review(page).getByRole('group', {
      name: 'Title: Your changes',
      exact: true,
    })
    await expect(selected.getByText('Title', { exact: true })).toBeVisible()
    await expect(
      selected.getByRole('textbox', { name: 'Title', exact: true }),
    ).toHaveValue('My title')
    await expect(selected).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(selected).toHaveCSS('border-top-width', '0px')
    await page.screenshot({ path: test.info().outputPath('merge-desktop.png') })
    await review(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(review(page)).toHaveCount(0)
    await expect(field(page, 'Title')).toHaveValue('My title')
    await expect(field(page, 'Published')).toHaveValue('Updated date')
    await expect(field(page, 'Author name')).toHaveValue('My author')
    await expect(field(page, 'Author email')).toHaveValue('saved@example.com')
    await remote.reload()
    await expect(field(remote, 'Title')).toHaveValue('My title')
    await expect(field(remote, 'Published')).toHaveValue('Updated date')
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await expect(field(remote, 'Author name')).toHaveValue('My author')
  } finally {
    await remoteContext.close()
  }
})

test('mobile review stacks choices and keeps other local changes when choosing a saved field', async ({
  page,
  browser,
  context,
  isolation,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(entry)
  await page.waitForLoadState('networkidle')
  await field(page, 'Title').fill('Local title')
  await field(page, 'Author email').fill('local@example.com')
  const remoteContext = await browser.newContext({
    storageState: await context.storageState(),
    extraHTTPHeaders: { 'x-pagescms-e2e-scope': isolation.scope },
  })
  try {
    const remote = await remoteContext.newPage()
    await remote.goto(new URL(entry, page.url()).href)
    await remote.waitForLoadState('networkidle')
    await field(remote, 'Title').fill('Latest title')
    await save(remote)
    await expect(remote.getByText('File saved', { exact: true })).toBeVisible()
    await save(page)
    await expect(review(page)).toBeVisible()
    const columns = review(page).locator('[data-merge-choices] > div')
    const mine = await columns.nth(0).boundingBox(),
      theirs = await columns.nth(1).boundingBox()
    expect(theirs!.y).toBeGreaterThan(mine!.y)
    expect(Math.abs(theirs!.x - mine!.x)).toBeLessThan(2)
    expect(
      await review(page).evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    for (const column of await columns.all()) {
      const version = (await column
        .locator('[data-merge-version]')
        .boundingBox())!
      const label = (await column
        .locator('[data-slot=field-label]')
        .boundingBox())!
      const input = (await column.getByRole('textbox').boundingBox())!
      const radio = (await column.getByRole('radio').boundingBox())!
      const columnBounds = (await column.boundingBox())!
      expect(Math.abs(version.x - columnBounds.x)).toBeLessThan(1)
      expect(Math.abs(version.x - radio.x)).toBeLessThan(1)
      expect(version.x).toBeLessThan(label.x)
      expect(Math.abs(label.x - input.x)).toBeLessThan(1)
      expect(
        Math.abs(radio.y + radio.height / 2 - label.y - label.height / 2),
      ).toBeLessThan(3)
    }
    await review(page)
      .getByRole('radio', { name: /Use latest saved version$/ })
      .click()
    await page.screenshot({ path: test.info().outputPath('merge-mobile.png') })
    await review(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(review(page)).toHaveCount(0)
    await expect(field(page, 'Title')).toHaveValue('Latest title')
    await expect(field(page, 'Author email')).toHaveValue('local@example.com')
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await page.reload()
    await expect(field(page, 'Title')).toHaveValue('Latest title')
    await expect(field(page, 'Author email')).toHaveValue('local@example.com')
  } finally {
    await remoteContext.close()
  }
})

test('rich text keeps its label and formatted content together in read-only comparison', async ({
  page,
  browser,
  context,
  isolation,
}) => {
  const path = '/pagescms/fixture/main/file/html-editor'
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  await field(page, 'HTML body').fill('My formatted text')
  const otherContext = await browser.newContext({
    storageState: await context.storageState(),
    extraHTTPHeaders: { 'x-pagescms-e2e-scope': isolation.scope },
  })
  try {
    const other = await otherContext.newPage()
    await other.goto(new URL(path, page.url()).href)
    await other.waitForLoadState('networkidle')
    await field(other, 'HTML body').fill('Other formatted text')
    await save(other)
    await expect(other.getByText('File saved', { exact: true })).toBeVisible()
    await save(page)
    const mine = review(page).getByRole('group', {
      name: 'HTML body: Your changes',
      exact: true,
    })
    const saved = review(page).getByRole('group', {
      name: 'HTML body: Latest saved version',
      exact: true,
    })
    for (const comparison of [mine, saved]) {
      await expect(
        comparison.locator('[data-slot=field-header] label'),
      ).toHaveText('HTML body')
      await expect(
        comparison.getByRole('textbox', { name: 'HTML body', exact: true }),
      ).toHaveAttribute('contenteditable', 'false')
    }
    await expect(mine).toContainText('My formatted text')
    await expect(saved).toContainText('Other formatted text')
    await mine.getByRole('radio').click()
    await page.screenshot({
      path: test.info().outputPath('merge-rich-text.png'),
    })
    await review(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(review(page)).toHaveCount(0)
    await expect(field(page, 'HTML body')).toHaveText('My formatted text')
  } finally {
    await otherContext.close()
  }
})

test('activating a Markdown field label keeps its leading linked image aligned despite gap-cursor decorations', async ({
  page,
  browser,
  context,
  isolation,
}) => {
  const path =
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md'
  const source =
    '[![Hero](public/images/hero.svg)](https://example.com)\n\nMy body\n\nLast paragraph'
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.route('**/api/media-preview/**/hero.svg*', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGNQ6jhDU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAPd02ExFsQqDAAAAAElFTkSuQmCC',
        'base64',
      ),
    }),
  )
  await page.goto(path)
  await page.getByRole('tab', { name: 'Source', exact: true }).click()
  await field(page, 'Body source').fill(source)
  const otherContext = await browser.newContext({
    storageState: await context.storageState(),
    extraHTTPHeaders: { 'x-pagescms-e2e-scope': isolation.scope },
  })
  try {
    const other = await otherContext.newPage()
    await other.goto(new URL(path, page.url()).href)
    await other.getByRole('tab', { name: 'Source', exact: true }).click()
    await field(other, 'Body source').fill(
      source.replace('My body', 'Saved body'),
    )
    await save(other)
    await expect(other.getByText('File saved', { exact: true })).toBeVisible()
    await save(page)
    await expect(review(page)).toBeVisible()
    const bodies = review(page).getByRole('textbox', {
      name: 'Body',
      exact: true,
    })
    await expect(bodies).toHaveCount(2)
    await expect
      .poll(() =>
        bodies.evaluateAll((elements) =>
          elements.every((element) => {
            const image = element.querySelector('img')
            return image?.complete && image.naturalWidth > 0
          }),
        ),
      )
      .toBe(true)
    const measure = () =>
      bodies.evaluateAll((elements) =>
        elements.map((element) => ({
          height: element.getBoundingClientRect().height,
          imageTop:
            element.querySelector('img')!.getBoundingClientRect().top -
            element.getBoundingClientRect().top,
          html: element.innerHTML,
          imageDisplay: getComputedStyle(element.querySelector('img')!).display,
          imageMargin: getComputedStyle(element.querySelector('img')!)
            .marginTop,
          padding: getComputedStyle(element).paddingTop,
        })),
      )
    const before = await measure()
    for (let i = 0; i < 3; i++) {
      await review(page)
        .getByRole('radio', { name: /Use my changes$/ })
        .click()
      await review(page)
        .getByRole('group', { name: 'Body: Latest saved version', exact: true })
        .getByText('Body', { exact: true })
        .click({ force: true })
    }
    // Label activation creates a real ProseMirror decoration before the image.
    await expect(bodies.nth(1).locator('.ProseMirror-gapcursor')).toHaveCount(1)
    const after = await measure()
    await page.screenshot({
      path: test.info().outputPath('merge-gapcursor-fixed.png'),
      clip: { x: 24, y: 24, width: 976, height: 480 },
    })
    await test.info().attach('markdown-layout.json', {
      body: JSON.stringify({ before, after }, null, 2),
      contentType: 'application/json',
    })
    expect(after.map(({ imageTop, height }) => ({ imageTop, height }))).toEqual(
      before.map(({ imageTop, height }) => ({ imageTop, height })),
    )
    await review(page)
      .getByRole('button', { name: 'Cancel', exact: true })
      .click()
    await expect(review(page)).toHaveCount(0)
    await expect(field(page, 'Body source')).toHaveValue(source)
  } finally {
    await otherContext.close()
  }
})

test('list changes stay atomic and another save during review requires new choices', async ({
  page,
  browser,
  context,
  isolation,
}) => {
  await page.setViewportSize({ width: 1280, height: 480 })
  await page.goto(entry)
  await page.waitForLoadState('networkidle')
  await field(page, 'Item title').nth(0).fill('My first item')
  const remoteContext = await browser.newContext({
    storageState: await context.storageState(),
    extraHTTPHeaders: { 'x-pagescms-e2e-scope': isolation.scope },
  })
  try {
    const remote = await remoteContext.newPage()
    await remote.goto(new URL(entry, page.url()).href)
    await remote.waitForLoadState('networkidle')
    await field(remote, 'Item title').nth(1).fill('Saved second item')
    await field(remote, 'Published').fill('Updated date')
    await save(remote)
    await expect(remote.getByText('File saved', { exact: true })).toBeVisible()
    await save(page)
    await expect(
      review(page).getByRole('region', { name: 'Items', exact: true }),
    ).toBeVisible()
    await expect(
      review(page).getByText('Choose one complete list.'),
    ).toBeVisible()
    await expect(review(page).locator('pre')).toHaveCount(0)
    await expect(
      review(page)
        .getByRole('group', { name: 'Items: Your changes', exact: true })
        .getByRole('textbox', { name: 'Item title', exact: true })
        .nth(0),
    ).toHaveValue('My first item')
    const headings = review(page).locator('[data-merge-headings]')
    const headerTop = (await headings.boundingBox())!.y
    const footer = review(page).locator('[data-slot=dialog-footer]')
    const footerTop = (await footer.boundingBox())!.y
    const scroller = review(page).locator('[data-merge-scroll]')
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect
      .poll(() => scroller.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)
    expect((await headings.boundingBox())!.y).toBe(headerTop)
    expect((await footer.boundingBox())!.y).toBe(footerTop)
    await page.screenshot({
      path: test.info().outputPath('merge-scrolled.png'),
    })
    await review(page)
      .getByRole('button', { name: 'Use all my changes', exact: true })
      .click()
    await field(remote, 'Item title').nth(1).fill('Another saved edit')
    await save(remote)
    await expect(
      remote.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await review(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(review(page)).toBeVisible()
    await expect(
      review(page)
        .getByRole('group', {
          name: 'Items: Latest saved version',
          exact: true,
        })
        .getByRole('textbox', { name: 'Item title', exact: true })
        .nth(1),
    ).toHaveValue('Another saved edit')
    await expect(
      review(page).getByRole('button', { name: 'Save changes' }),
    ).toBeDisabled()
    await review(page)
      .getByRole('radio', { name: /Use latest saved version$/ })
      .click()
    await review(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(review(page)).toHaveCount(0)
    await expect(field(page, 'Published')).toHaveValue('Updated date')
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await expect(field(page, 'Item title').nth(0)).toHaveValue('First item')
    await expect(field(page, 'Item title').nth(1)).toHaveValue(
      'Another saved edit',
    )
  } finally {
    await remoteContext.close()
  }
})

test('a failed reviewed save retains choices and allows a new selection before retrying', async ({
  page,
  browser,
  context,
  isolation,
}) => {
  await page.goto(entry)
  await page.waitForLoadState('networkidle')
  await field(page, 'Title').fill('My retry title')
  await field(page, 'Author name').fill('My retry author')
  const remoteContext = await browser.newContext({
    storageState: await context.storageState(),
    extraHTTPHeaders: { 'x-pagescms-e2e-scope': isolation.scope },
  })
  try {
    const remote = await remoteContext.newPage()
    await remote.goto(new URL(entry, page.url()).href)
    await remote.waitForLoadState('networkidle')
    await field(remote, 'Title').fill('Latest retry title')
    await save(remote)
    await expect(remote.getByText('File saved', { exact: true })).toBeVisible()
    await save(page)
    await expect(review(page)).toBeVisible()
    await review(page)
      .getByRole('radio', { name: /Use my changes$/ })
      .click()
    let release!: (route: Route) => void
    const request = new Promise<Route>((resolve) => {
      release = resolve
    })
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'POST') release(route)
      else await route.continue()
    })
    await review(page)
      .getByRole('button', { name: 'Save changes', exact: true })
      .click()
    const pending = await request
    await expect(
      review(page).getByRole('button', { name: 'Saving changes', exact: true }),
    ).toBeDisabled()
    await expect(
      review(page).getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeDisabled()
    await expect(review(page).getByRole('radio').first()).toBeDisabled()
    await pending.abort('failed')
    await page.unroute('**/*')
    await expect(
      review(page).getByRole('button', { name: 'Save changes', exact: true }),
    ).toBeEnabled()
    await expect(review(page).getByRole('alert')).toBeVisible()
    await expect(
      review(page).getByRole('radio', { name: /Use my changes$/ }),
    ).toHaveAttribute('aria-checked', 'true')
    // Retry with a different selection: the failed attempt's own rebase must
    // not be mistaken for unrelated edits made while the review was open.
    await review(page)
      .getByRole('radio', { name: /Use latest saved version$/ })
      .click()
    await review(page)
      .getByRole('button', { name: 'Save changes', exact: true })
      .click()
    await expect(review(page)).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await remote.reload()
    await expect(field(remote, 'Title')).toHaveValue('Latest retry title')
    await expect(field(remote, 'Author name')).toHaveValue('My retry author')
  } finally {
    await page.unroute('**/*')
    await remoteContext.close()
  }
})

test('draft age opens local save details and discards without recreating the draft', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto(entry)
  await page.waitForLoadState('networkidle')
  const draft = page.getByRole('button', { name: /^Local draft:/ })
  await expect(draft).toHaveCount(0)
  await field(page, 'Title').fill('Discard this edit')
  await expect(draft).toHaveText('Just now')
  await page.clock.fastForward(4 * 60_000)
  await expect(draft).toHaveText('4m ago')
  await draft.click()
  const details = page.getByRole('dialog', { name: 'Local draft', exact: true })
  await expect(details).toContainText(
    'Last saved in this browser 4 minutes ago.',
  )
  await expect(details).toContainText(
    'These changes haven’t been saved to your project.',
  )
  await expect(details).toContainText(
    'Discarding removes your unsaved changes and restores the last loaded or saved version.',
  )
  await page.screenshot({
    path: test.info().outputPath('draft-details.png'),
    clip: { x: 0, y: 0, width: 1280, height: 480 },
  })
  await page.keyboard.press('Escape')
  await expect(field(page, 'Title')).toHaveValue('Discard this edit')
  await page.reload()
  await expect(draft).toHaveText('4m ago')
  await draft.click()
  await details
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click()
  await expect(field(page, 'Title')).toHaveValue('Original title')
  await expect(draft).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.reload()
  await expect(field(page, 'Title')).toHaveValue('Original title')
})

for (const scenario of [
  {
    label: 'raw source',
    path: '/pagescms/fixture/main/file/raw-code',
    editor: 'Entry source',
    local: 'const local = 1',
    remote: 'const saved = 2',
    saved: 'File saved',
  },
  {
    label: 'configuration',
    path: '/pagescms/fixture/main/configuration',
    editor: 'Pages CMS configuration',
    local: 'content: []\n# local version',
    remote: 'content: []\n# saved version',
    saved: 'Configuration saved',
  },
]) {
  test(`${scenario.label} review requires a whole-source choice`, async ({
    page,
    browser,
    context,
    isolation,
  }) => {
    await page.goto(scenario.path)
    await page.waitForLoadState('networkidle')
    await field(page, scenario.editor).fill(scenario.local)
    const remoteContext = await browser.newContext({
      storageState: await context.storageState(),
      extraHTTPHeaders: { 'x-pagescms-e2e-scope': isolation.scope },
    })
    try {
      const remote = await remoteContext.newPage()
      await remote.goto(new URL(scenario.path, page.url()).href)
      await remote.waitForLoadState('networkidle')
      await field(remote, scenario.editor).fill(scenario.remote)
      await save(remote)
      await expect(
        remote.getByText(scenario.saved, { exact: true }),
      ).toBeVisible()
      await save(page)
      await expect(review(page)).toBeVisible()
      await expect(review(page).getByRole('region')).toHaveCount(1)
      await review(page)
        .getByRole('radio', { name: /Use my changes$/ })
        .click()
      await review(page).getByRole('button', { name: 'Save changes' }).click()
      await expect(review(page)).toHaveCount(0)
      await expect(field(page, scenario.editor).locator('.cm-line')).toHaveText(
        scenario.local.split('\n'),
      )
      await expect(
        page.getByText(scenario.saved, { exact: true }),
      ).toBeVisible()
      await remote.reload()
      await expect(
        field(remote, scenario.editor).locator('.cm-line'),
      ).toHaveText(scenario.local.split('\n'))
    } finally {
      await remoteContext.close()
    }
  })
}

test('an invalid configuration draft can still be reset', async ({ page }) => {
  await page.goto('/pagescms/fixture/main/configuration')
  await page.waitForLoadState('networkidle')
  const editor = field(page, 'Pages CMS configuration')
  await editor.fill('content: [')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: /^Local draft:/ }).click()
  await page
    .getByRole('dialog', { name: 'Local draft', exact: true })
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click()
  await expect(editor).toContainText('settings:')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.reload()
  await expect(editor).toContainText('settings:')
})

test('disjoint changes combine without field choices and older drafts require a whole version', async ({
  page,
  browser,
  context,
  isolation,
}) => {
  await page.goto(entry)
  await page.waitForLoadState('networkidle')
  await field(page, 'Title').fill('My disjoint edit')
  const remoteContext = await browser.newContext({
    storageState: await context.storageState(),
    extraHTTPHeaders: { 'x-pagescms-e2e-scope': isolation.scope },
  })
  try {
    const remote = await remoteContext.newPage()
    await remote.goto(new URL(entry, page.url()).href)
    await remote.waitForLoadState('networkidle')
    await field(remote, 'Published').fill('Remote date')
    await save(remote)
    await expect(remote.getByText('File saved', { exact: true })).toBeVisible()
    await save(page)
    await expect(review(page)).toBeVisible()
    await expect(review(page).getByRole('region')).toHaveCount(0)
    await review(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(review(page)).toHaveCount(0)
    await expect(field(page, 'Title')).toHaveValue('My disjoint edit')
    await expect(field(page, 'Published')).toHaveValue('Remote date')
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await field(page, 'Title').fill('An older draft')
    await page.getByRole('link', { name: 'Overview', exact: true }).click()
    // Navigation flushes the draft before emulating its older storage format.
    // Emulate a draft written before original values were persisted.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('pagescms-content-drafts')
          request.onsuccess = () => {
            const transaction = request.result.transaction(
              'drafts',
              'readwrite',
            )
            const store = transaction.objectStore('drafts')
            const all = store.getAll()
            all.onsuccess = () =>
              store.put({ ...all.result[0], base: undefined })
            transaction.oncomplete = () => {
              request.result.close()
              resolve()
            }
            transaction.onabort = () => reject(transaction.error)
          }
          request.onerror = () => reject(request.error)
        }),
    )
    await remote.reload()
    await expect(field(remote, 'Title')).toHaveValue('My disjoint edit')
    await field(remote, 'Published').fill('Another remote date')
    await save(remote)
    await expect(
      remote.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled()
    await page.goto(entry)
    await save(page)
    await expect(
      review(page).getByText(
        'This entry has two versions that cannot be combined automatically. Compare them and choose which one to keep.',
      ),
    ).toBeVisible()
    await expect(review(page).getByRole('region')).toHaveCount(1)
    await review(page)
      .getByRole('radio', { name: /Use latest saved version$/ })
      .click()
    await review(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(review(page)).toHaveCount(0)
    await expect(field(page, 'Title')).toHaveValue('My disjoint edit')
    await expect(field(page, 'Published')).toHaveValue('Another remote date')
  } finally {
    await remoteContext.close()
  }
})

test('nested conflicts keep field labels and remain inside the visible viewport when zoomed', async ({
  page,
  browser,
  context,
  isolation,
}) => {
  test.skip(
    browser.browserType().name() !== 'chromium',
    'Chromium pinch zoom uses its DevTools protocol.',
  )
  await page.goto(entry)
  await page.waitForLoadState('networkidle')
  await field(page, 'Author email').fill('mine@example.com')
  const otherContext = await browser.newContext({
    storageState: await context.storageState(),
    extraHTTPHeaders: { 'x-pagescms-e2e-scope': isolation.scope },
  })
  try {
    const other = await otherContext.newPage()
    await other.goto(new URL(entry, page.url()).href)
    await other.waitForLoadState('networkidle')
    await field(other, 'Author email').fill('saved@example.com')
    await save(other)
    await expect(other.getByText('File saved', { exact: true })).toBeVisible()
    await save(page)
    const nested = review(page).getByRole('region', {
      name: 'Author › Author email',
      exact: true,
    })
    await expect(nested).toBeVisible()
    await expect(nested.locator('input').nth(0)).toHaveValue('mine@example.com')
    await expect(nested.locator('input').nth(1)).toHaveValue(
      'saved@example.com',
    )
    await expect(nested.locator('input').nth(0)).toBeDisabled()
    const mine = nested.getByRole('radio', { name: /Use my changes$/ })
    const saved = nested.getByRole('radio', {
      name: /Use latest saved version$/,
    })
    await mine.press('Space')
    await expect(mine).toHaveAttribute('aria-checked', 'true')
    // Radix schedules roving focus; keep the key held through its focus handler.
    await page.keyboard.down('ArrowRight')
    try {
      await expect(saved).toHaveAttribute('aria-checked', 'true')
    } finally {
      await page.keyboard.up('ArrowRight')
    }
    await expect(mine).toHaveAttribute('aria-checked', 'false')
    const cdp = await context.newCDPSession(page)
    try {
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2.5 })
      await expect
        .poll(() =>
          page.evaluate(() => {
            const viewport = window.visualViewport!
            const dialog = document
              .querySelector('[role=dialog]')!
              .getBoundingClientRect()
            const footer = document.querySelector('[data-slot=dialog-footer]')!
            const body = document.querySelector('[data-merge-scroll]')!
            const controlsFit = [...footer.querySelectorAll('button')].every(
              (button) => {
                const rect = button.getBoundingClientRect()
                return (
                  rect.left >= dialog.left &&
                  rect.right <= dialog.right &&
                  rect.bottom <= dialog.bottom
                )
              },
            )
            return (
              dialog.left >= viewport.offsetLeft &&
              dialog.right <= viewport.offsetLeft + viewport.width + 1 &&
              dialog.top >= viewport.offsetTop &&
              dialog.bottom <= viewport.offsetTop + viewport.height + 1 &&
              controlsFit &&
              body.getBoundingClientRect().height >= 90 &&
              footer.getBoundingClientRect().bottom <= dialog.bottom + 1
            )
          }),
        )
        .toBe(true)
      const columns = nested.locator('[data-merge-choices] > div')
      await expect
        .poll(async () => {
          const a = await columns.nth(0).boundingBox(),
            b = await columns.nth(1).boundingBox()
          return b!.y > a!.y
        })
        .toBe(true)
      await page.screenshot({
        path: test.info().outputPath('merge-zoomed.png'),
      })
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
    } finally {
      await cdp.detach()
    }
    await review(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(review(page)).toHaveCount(0)
    await expect(field(page, 'Author email')).toHaveValue('saved@example.com')
  } finally {
    await otherContext.close()
  }
})
