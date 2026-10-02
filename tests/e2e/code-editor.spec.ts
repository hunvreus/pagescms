import { expect, test } from '@playwright/test'

test('raw files use the same CodeMirror editor and persist source exactly', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/raw-code')
  const editor = page.getByRole('textbox', { name: 'Entry source' })
  await expect(editor).toHaveClass(/cm-content/)
  await expect(editor).toContainText('const original: number = 42')
  await editor.fill('const changed: number = 123\n')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.reload()
  await expect(editor).toContainText('const changed: number = 123')
})

test('code fields use CodeMirror, preserve edits and undo, and respect readonly', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/code')
  const editor = page.getByRole('textbox', { name: 'Script', exact: true })
  await expect(editor).toContainText('const answer: number = 42')
  await expect(editor).toHaveClass(/cm-content/)
  await expect(editor).toHaveAttribute('contenteditable', 'true')
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
  await page.reload()
  await expect(editor).toContainText('const answer: number = 123')
  await expect(locked).toContainText('{"locked":true}')
})

test('configuration shows YAML diagnostics and blocks invalid saves', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/configuration')
  const editor = page.getByRole('textbox', { name: 'Pages CMS configuration' })
  await expect(editor).toContainText('content:')
  await editor.fill('content: [')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('end with a ]')
  await expect(page.locator('.cm-lint-marker-error').first()).toBeVisible()
  await editor.fill('content: false')
  await expect(page.locator('.cm-lintRange-error').first()).toBeVisible()
  await editor.fill('media: public/images\n')
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled()
})
