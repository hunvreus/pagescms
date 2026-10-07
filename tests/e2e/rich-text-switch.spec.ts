import { expect, test } from './test'

test('rich-text typing survives switching to source and back', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  const editor = page.getByRole('textbox', { name: 'Body', exact: true })
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' before-switch')
  await expect(editor).toContainText('before-switch')
  for (let index = 0; index < 2; index++) {
    await page.getByRole('tab', { name: 'Source', exact: true }).click()
    await expect(
      page.getByRole('textbox', { name: 'Body source', exact: true }),
    ).toContainText('before-switch')
    await page.getByRole('tab', { name: 'Editor', exact: true }).click()
    await editor.click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type(` after-switch-${index}`)
    await expect(editor).toContainText(`after-switch-${index}`)
    await expect(editor).toContainText('before-switch')
  }
  expect(errors).toEqual([])
})
