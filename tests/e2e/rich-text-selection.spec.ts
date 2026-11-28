import { expect, test } from './test'

for (const theme of ['light', 'dark'] as const) {
  for (const format of ['markdown', 'html'] as const) {
    test(`${theme} ${format} block selection keeps text readable without changing content`, async ({
      page,
    }) => {
      await page.addInitScript(
        (value) => localStorage.setItem('theme', value),
        theme,
      )
      await page.goto(
        format === 'html'
          ? '/github/pagescms/fixture/main/file/html-editor'
          : '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
      )
      const editor = page.getByRole('textbox', {
        name: format === 'html' ? 'HTML body' : 'Body',
        exact: true,
      })
      await expect(editor).toBeVisible()
      const paragraph = editor.locator('p').first()
      const before = await paragraph.innerText()
      await paragraph.click({ modifiers: ['ControlOrMeta'] })
      await expect(paragraph).toHaveClass(/ProseMirror-selectednode/)
      const colors = await paragraph.evaluate((element) => ({
        text: getComputedStyle(element).color,
        selectedText: getComputedStyle(element, '::selection').color,
      }))
      expect(colors.selectedText).toBe(colors.text)
      await expect(paragraph).toHaveText(before)
      await expect(
        page.getByRole('button', { name: 'Save', exact: true }),
      ).toBeDisabled()
    })
  }
}

test('keeps matching slash commands mounted while filtering', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/html-editor')
  const editor = page.getByRole('textbox', { name: 'HTML body', exact: true })
  await expect(editor).toContainText('HTML title')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  const headings = page.getByRole('button', { name: /^Heading [123]$/ })
  await expect(headings).toHaveCount(3)
  const original = await Promise.all(
    (await headings.all()).map((heading) => heading.elementHandle()),
  )
  await page.keyboard.type('h')
  await expect(headings).toHaveCount(3)
  expect(
    await Promise.all(
      original.map((node) => node.evaluate((element) => element.isConnected)),
    ),
  ).toEqual([true, true, true])
})
