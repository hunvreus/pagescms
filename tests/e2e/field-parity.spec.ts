import { expect, test } from './test'

test('named selects, formatted dates, file reordering and safe uploads persist', async ({
  page,
}) => {
  page.on('pageerror', (error) =>
    console.error('parity page error', error.message),
  )
  page.on('console', (message) => {
    if (message.type() === 'error')
      console.error('parity console error', message.text())
  })
  await page.goto('/pagescms/fixture/main/file/field-parity')
  await expect(page.getByRole('combobox')).toHaveText('Draft')
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Published', exact: true }).click()
  const date = page.getByLabel('Date', { exact: true })
  await expect(date).toHaveValue('2026-10-02')
  await date.fill('2026-10-03')
  const handles = page.getByRole('button', { name: 'Reorder item' })
  await handles.first().focus()
  await handles.first().press('Space')
  await expect(handles.first()).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('status')).toContainText(
    'moved over droppable area 1:public/images/parity-b.txt',
  )
  await page.keyboard.press('Space')
  const fileRows = handles.locator('..')
  await expect(fileRows.first()).toContainText('parity-b.txt')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'Parity Upload.TXT',
    mimeType: 'text/plain',
    buffer: Buffer.from('upload'),
  })
  await expect(
    page.getByRole('button', {
      name: 'Remove public/images/parity-upload.txt',
      exact: true,
    }),
  ).toBeVisible()
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await save.click()
  await expect(save).toBeDisabled()
  await page.reload()
  await expect(page.getByRole('combobox')).toHaveText('Published')
  await expect(date).toHaveValue('2026-10-03')
  await expect(fileRows.first()).toContainText('parity-b.txt')
  await expect(
    page.getByRole('button', {
      name: 'Remove public/images/parity-upload.txt',
      exact: true,
    }),
  ).toBeVisible()
})
