import { expect, test } from './test'
import { configuration } from './github-fixture.server'

test('raw files use the same CodeMirror editor and persist source exactly', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/raw-code')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Entry actions' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
  const github = menu.getByRole('menuitem', { name: 'View on GitHub' })
  await expect(github).toBeVisible()
  expect(
    await github.evaluate((element) => getComputedStyle(element).whiteSpace),
  ).toBe('nowrap')
  await page.keyboard.press('Escape')
  const editor = page.getByRole('textbox', { name: 'Entry source' })
  await expect(page.getByText('Source editor', { exact: true })).toHaveCount(0)
  await expect(editor).toHaveClass(/cm-content/)
  await expect(editor).toContainText('const original: number = 42')
  await editor.fill('const changed: number = 123\n')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).not.toHaveAttribute('aria-busy', 'true')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.reload()
  await expect(editor).toContainText('const changed: number = 123')
})

test('code fields use CodeMirror, preserve edits and undo, and respect readonly', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/code')
  const editor = page.getByRole('textbox', { name: 'Script', exact: true })
  await expect(editor).toContainText('const answer: number = 42')
  await expect
    .poll(() => editor.locator('.cm-line span').count())
    .toBeGreaterThan(0)
  expect(
    await editor
      .locator('.cm-line span')
      .evaluateAll(
        (spans) =>
          new Set(spans.map((span) => getComputedStyle(span).color)).size,
      ),
  ).toBeGreaterThan(1)
  await expect(editor).toHaveClass(/cm-content/)
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await expect(page.locator('.cm-gutters')).toHaveCount(0)
  const locked = page.getByRole('textbox', { name: 'Locked code', exact: true })
  await expect(locked).toHaveAttribute('contenteditable', 'false')
  await editor.fill('const answer: number = 123')
  await editor.press('End')
  await editor.press('Enter')
  await editor.press('a')
  await expect(editor).toContainText('a')
  await editor.press('ControlOrMeta+z')
  await expect(editor).toHaveText('const answer: number = 123\n')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toHaveAttribute('aria-busy', 'false')
  await page.reload()
  await expect(editor).toContainText('const answer: number = 123')
  await expect(locked).toContainText('{"locked":true}')
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`multiline field surfaces match the standard input in ${colorScheme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme })
    const surface = (element: Element) => {
      const { backgroundColor, borderRadius } = getComputedStyle(element)
      return { backgroundColor, borderRadius }
    }
    await page.goto('/github/pagescms/fixture/main/file/code')
    const code = page.locator('.pagescms-code-editor').filter({
      has: page.getByRole('textbox', { name: 'Script', exact: true }),
    })
    await expect(code).toBeVisible()
    const codeStyle = await code.evaluate(surface)
    await page.goto(
      '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
    )
    const title = page.getByRole('textbox', { name: 'Title', exact: true })
    const body = page.getByRole('textbox', { name: 'Body', exact: true })
    await expect(body).toBeVisible()
    expect(
      await page
        .locator('html')
        .evaluate((el) => el.classList.contains('dark')),
    ).toBe(colorScheme === 'dark')
    const standard = await title.evaluate(surface)
    expect(codeStyle).toEqual(standard)
    expect(await body.evaluate(surface)).toEqual(standard)
    await page.getByRole('radio', { name: 'Source', exact: true }).click()
    const textarea = page.getByRole('textbox', {
      name: 'Body source',
      exact: true,
    })
    expect(await textarea.evaluate(surface)).toEqual(standard)
  })
}

test('configuration shows YAML diagnostics and blocks invalid saves', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.goto(
    '/github/pagescms/fixture/main/configuration?edit=configuration',
  )
  await page.waitForLoadState('networkidle')
  const editor = page.getByRole('textbox', { name: 'Configuration' })
  await expect(editor).toContainText('content:')
  await expect
    .poll(() => editor.locator('.cm-line span').count())
    .toBeGreaterThan(0)
  expect(
    await editor
      .locator('.cm-line span')
      .evaluateAll(
        (spans) =>
          new Set(spans.map((span) => getComputedStyle(span).color)).size,
      ),
  ).toBeGreaterThan(1)
  async function replace(value: string) {
    await editor.press('ControlOrMeta+a')
    await page.keyboard.type(value)
  }
  await replace('content: [')
  await editor.press('Delete')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await editor.press('ControlOrMeta+Shift+m')
  await expect(page.locator('.cm-panel-lint')).toContainText(
    'unexpected end of the stream within a flow collection',
  )
  await page.locator('.cm-panel-lint button[name=close]').click()
  await expect(page.locator('.cm-gutters')).toHaveCount(0)
  await replace('media: *missing')
  await expect(page.locator('.cm-lintRange-error')).toHaveText('*missing')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.locator('.cm-lintRange-error').hover()
  await expect(page.locator('.cm-diagnostic-error')).toContainText(
    'must reference an earlier anchor',
  )
  await replace('content: false')
  await expect(page.locator('.cm-lintRange-error').first()).toBeVisible()
  await page.locator('.cm-lintRange-error').first().hover()
  await expect(page.locator('.cm-diagnostic-error')).toContainText('array')
  await replace('settings:\n  surprise: true')
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(0)
  await expect(page.locator('.cm-lintRange-warning')).toHaveText('surprise')
  await page.evaluate(() => document.documentElement.classList.toggle('dark'))
  await expect(page.locator('.cm-lintRange-warning')).toHaveText('surprise')
  await page.locator('.cm-lintRange-warning').hover()
  await expect(page.locator('.cm-diagnostic-warning')).toContainText(
    "Property 'surprise' isn't valid and will be ignored.",
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toHaveAttribute('aria-busy', 'false')
  await page.reload()
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await expect(editor).toContainText('surprise: true')
  await expect(page.locator('.cm-lintRange-warning')).toHaveText('surprise')
  await replace('media: public/images')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled()
  await expect(page.locator('.cm-lintRange-warning')).toHaveCount(0)
})

test('managers can open and repair malformed repository configuration', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/malformed-config')
  await expect(
    page.getByText('Configuration needs fixing', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Edit configuration', exact: true })
    .click()
  const editor = page.getByRole('textbox', { name: 'Configuration' })
  await expect(editor).toHaveText('content: [')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await editor.fill(configuration)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('Configuration saved', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(editor).toContainText('content:')
  await expect(
    page.getByRole('link', { name: 'Posts', exact: true }),
  ).toBeVisible()
})

test('empty configuration shows a placeholder without inserting source', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/unconfigured/configuration')
  const editor = page.getByRole('textbox', { name: 'Configuration' })
  await expect(page.locator('.cm-placeholder')).toHaveText(
    'media: media\ncontent:\n  - name: posts\n    type: collection\n    path: content/posts',
  )
  await expect(editor).toContainText('path: content/posts')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
})
