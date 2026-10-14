import { expect, test } from './test'

test('open block editors do not render during pointer or keyboard dragging', async ({
  page,
}) => {
  test.skip(
    process.env.PAGESCMS_E2E_PRODUCTION === 'true',
    'Renderer instrumentation uses Vite source modules',
  )
  await page.setViewportSize({ width: 1280, height: 1400 })
  // Load the deferred editor before instrumentation; Vite may reload on first use.
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await expect(
    page.getByRole('textbox', { name: 'Body', exact: true }),
  ).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.goto('/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  // Count actual renderer calls, rather than using DOM mutations as a proxy.
  await page.evaluate(async () => {
    const modulePath = '/src/features/editor/fields/core-field-renderers.tsx'
    const { coreFieldRendererRegistry } = await import(modulePath)
    const original = coreFieldRendererRegistry.get('rich-text')
    document.documentElement.dataset.editorRenders = '0'
    coreFieldRendererRegistry.register('rich-text', (props: unknown) => {
      document.documentElement.dataset.editorRenders = String(
        Number(document.documentElement.dataset.editorRenders) + 1,
      )
      return original(props)
    })
  })
  await page
    .getByRole('button', { name: 'Item #1', exact: true })
    .last()
    .click()
  const editors = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(editors.first()).toContainText('Hello')
  await page.getByRole('button', { name: 'Add item', exact: true }).click()
  await page.getByRole('button', { name: 'Item #2', exact: true }).click()
  await page.getByRole('button', { name: 'Widget', exact: true }).click()
  const headings = page.getByRole('textbox', {
    name: 'Block heading',
    exact: true,
  })
  await headings.nth(1).fill('Second block')
  await editors.nth(1).click()
  await page.keyboard.type('Second block')
  await page.waitForLoadState('networkidle')
  const handles = page.getByRole('button', { name: 'Reorder item' })
  const renders = () => page.locator('html').getAttribute('data-editor-renders')
  const before = await renders()
  expect(Number(before)).toBeGreaterThan(0)
  const first = await handles.first().boundingBox()
  const second = await handles.nth(1).boundingBox()
  if (!first || !second) throw new Error('Missing drag handles')
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    second.x + second.width / 2,
    second.y + second.height / 2,
    { steps: 12 },
  )
  await expect(handles.first()).toHaveAttribute('aria-pressed', 'true')
  expect(await renders()).toBe(before)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(handles.first()).not.toHaveAttribute('aria-pressed', 'true')
  await handles.first().focus()
  await page.keyboard.press('Space')
  await expect(handles.first()).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  )
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('status').last()).toContainText(
    /moved over droppable area .*-1\./,
  )
  expect(await renders()).toBe(before)
  await page.keyboard.press('Space')
  await expect(editors.first()).toContainText('Second block')
  await expect(editors.nth(1)).toContainText('Hello')
  await editors.nth(1).click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Edited after moving')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Expand all', exact: true }).click()
  await expect(headings.first()).toHaveValue('Second block')
  await expect(headings.nth(1)).toHaveValue('First block')
  await expect(editors.first()).toContainText('Second block')
  await expect(editors.nth(1)).toContainText('Edited after moving')
})
