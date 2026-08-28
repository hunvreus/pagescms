import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test('supports the full-page media browsing and mutation workflow', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/media/default')

  await expect(page.getByRole('button', { name: 'Grid view' })).toBeVisible()
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
  await expect(page.getByText('Library', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible()
  await page.getByRole('button', { name: 'Grid view' }).click()

  await page.getByRole('button', { name: /Library/ }).click()
  await expect(page).toHaveURL(/path=public%2Fimages%2FLibrary/)
  await expect(page.getByText('nested.svg', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Media' }).click()

  await page.getByRole('button', { name: 'New folder' }).click()
  const folderDialog = page.getByRole('dialog', { name: 'New folder' })
  await folderDialog.getByPlaceholder('Folder name').fill('Uploads')
  await folderDialog.getByRole('button', { name: 'Create folder' }).click()
  await expect(page.getByText('Uploads', { exact: true })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'uploaded.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
    ),
  })
  await expect(page.getByText('uploaded.svg', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for uploaded.svg' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const renameDialog = page.getByRole('dialog', { name: 'Rename file' })
  await renameDialog.getByRole('textbox').fill('renamed.svg')
  await renameDialog.getByRole('button', { name: 'Rename' }).click()
  await expect(page.getByText('renamed.svg', { exact: true })).toBeVisible()
  await expect(page.getByText('uploaded.svg', { exact: true })).toHaveCount(0)

  const source = page.locator('[data-media-path="public/images/renamed.svg"]')
  const destination = page.locator('[data-media-path="public/images/Uploads"]')
  const sourceBox = await source.boundingBox()
  const destinationBox = await destination.boundingBox()
  expect(sourceBox).not.toBeNull()
  expect(destinationBox).not.toBeNull()
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    destinationBox!.x + destinationBox!.width / 2,
    destinationBox!.y + destinationBox!.height / 2,
    { steps: 12 },
  )
  await expect(source).toHaveAttribute('data-dragging', 'true')
  await expect(destination).toHaveAttribute('data-drop-active', 'true')
  await page.mouse.up()
  await expect(page.getByText('renamed.svg', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: /Uploads/ }).click()
  await expect(page.getByText('renamed.svg', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Actions for renamed.svg' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const deleteDialog = page.getByRole('alertdialog')
  await deleteDialog.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('renamed.svg', { exact: true })).toHaveCount(0)
  await expect(page.getByText('No media yet', { exact: true })).toBeVisible()
})

test('uses the same media browser inside the rich-text image picker', async ({
  page,
}) => {
  await page.goto(
    '/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )

  const body = page.getByRole('textbox', { name: 'Body' })
  await body.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/Image')
  await page.keyboard.press('Enter')

  const picker = page.getByRole('dialog', { name: 'Choose an image' })
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('button', { name: 'Grid view' })).toBeVisible()
  await picker
    .getByRole('button', { name: /hero.svg/ })
    .first()
    .click()
  await expect(picker).toHaveCount(0)
  await expect(body.locator('img')).toHaveCount(1)
})
