import { expect, test } from './test'

test.describe.configure({ mode: 'serial' })

test('a failed media load shows an error state and retries', async ({
  page,
}, testInfo) => {
  await page.route('**/api/media?**', (route) => route.abort('failed'))
  await page.goto('/github/pagescms/fixture/main/media/default')
  const error = page.getByRole('alert')
  await expect(
    error.getByText('Could not load media', { exact: true }),
  ).toBeVisible()
  await expect(
    page
      .locator('[data-slot="repository-page-header"]')
      .getByText('Media', { exact: true }),
  ).toBeVisible()
  await expect(
    page.locator('[data-slot="repository-page-header"] [data-slot="skeleton"]'),
  ).toHaveCount(0)
  const bounds = await error.boundingBox()
  expect(bounds!.height).toBeGreaterThan(500)
  await expect(page.getByText('No media yet', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('media-error.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileBounds = await error.boundingBox()
  expect(mobileBounds!.height).toBeGreaterThan(500)
  await page.screenshot({ path: testInfo.outputPath('media-error-mobile.png') })
  await page.unroute('**/api/media?**')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
})

test('a failed media list load keeps the table and retries', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/media/default')
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: 'List view' }).click()
  await page.route('**/api/media?**', (route) => route.abort('failed'))
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const table = page.locator('table').first()
  await expect(table.getByRole('alert')).toHaveText('Could not load media.')
  await expect(table.getByRole('columnheader', { name: 'Name' })).toBeVisible()
  await page.unroute('**/api/media?**')
  await table.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('nested.svg', { exact: true })).toBeVisible()
})

test('a failed image picker load centers the error and retries', async ({
  page,
}) => {
  await page.goto(
    '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )
  await page.locator('.ProseMirror').waitFor()
  await page.getByRole('radio', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Body source', exact: true })
  const original = await source.inputValue()
  await source.fill(`/\n\n${original}`)
  await page.getByRole('radio', { name: 'Editor', exact: true }).click()
  const editor = page.locator('.ProseMirror')
  await editor.locator('p').first().click()
  await editor.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End')
  await editor.pressSequentially('Image')
  await page.route('**/api/media?**', (route) => route.abort('failed'))
  await page.getByRole('button', { name: 'Image', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Choose an image' })
  const error = picker.getByRole('alert')
  await expect(
    error.getByText('Could not load media', { exact: true }),
  ).toBeVisible()
  const bounds = await error.boundingBox()
  expect(bounds!.height).toBeGreaterThan(250)
  await page.unroute('**/api/media?**')
  await picker.getByRole('button', { name: 'Try again' }).click()
  await expect(
    picker.getByRole('button', { name: /hero.svg/ }).first(),
  ).toBeVisible()
})

test('keeps media page chrome stable and restores cached folders immediately', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/media/default')
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible({
    timeout: 10_000,
  })

  let releaseRequest = () => {}
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve
  })
  let heldRequest = false
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (
      !heldRequest &&
      request.resourceType() === 'fetch' &&
      (decodeURIComponent(request.url()).includes('Library') ||
        request.postData()?.includes('Library'))
    ) {
      heldRequest = true
      await requestGate
    }
    await route.continue()
  })

  await page.getByRole('button', { name: /Library/ }).click()
  await expect(page).toHaveURL(/path=public%2Fimages%2FLibrary/)

  const header = page.locator('[data-slot="repository-page-header"]')
  await expect(header.getByText('Library', { exact: true })).toBeVisible({
    timeout: 250,
  })
  await expect(header.getByRole('button', { name: 'New folder' })).toBeVisible()
  await expect(header.getByRole('button', { name: 'Upload' })).toBeVisible()

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible()
  await expect(page.getByText('No media yet', { exact: true })).toHaveCount(0)
  await expect(page.getByText('No media yet.', { exact: true })).toHaveCount(0)

  releaseRequest()
  await expect(page.getByText('nested.svg', { exact: true })).toBeVisible()
  await expect(page.getByText(/failed to fetch/i)).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.unroute('**/*')

  await header.getByRole('button', { name: 'Media' }).click()
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible({
    timeout: 1_000,
  })
})

test('shows media loading immediately after a sidebar click', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main')
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/media?**', async (route) => {
    await gate
    await route.continue().catch(() => {})
  })
  try {
    await page.getByRole('link', { name: 'Media', exact: true }).click()
    await expect(
      page.locator('[data-slot="skeleton"].aspect-video').first(),
    ).toBeVisible({ timeout: 500 })
    await expect(
      page.locator('[data-slot="repository-page-header"]').last(),
    ).toBeVisible()
  } finally {
    release()
    await page.unroute('**/api/media?**')
  }
})

test('centers gallery folder labels and remembers the media view after reload', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/media/default')
  const folder = page.getByRole('button', { name: 'Library', exact: true })
  await expect(folder).toBeVisible()
  const label = folder.getByText('Library', { exact: true })
  await expect(label).toHaveCSS('text-align', 'center')
  await expect(label).toHaveCSS('padding-left', '12px')
  await page.getByRole('radio', { name: 'List view' }).click()
  await page.reload()
  await expect(page.getByRole('radio', { name: 'List view' })).toBeChecked()
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible()
  await page.getByRole('radio', { name: 'Grid view' }).click()
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Grid view' })).toBeChecked()
})

test('media list file menus leave scrolling unlocked and restore keyboard focus', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/media/default')
  await page.getByRole('radio', { name: 'List view' }).click()
  const trigger = page
    .getByRole('table')
    .getByRole('button', { name: 'Actions for hero.svg' })
  for (const action of ['Rename', 'Move to…', 'Delete']) {
    await trigger.press('Enter')
    const item = page.getByRole('menuitem', { name: action })
    await expect(item).toBeVisible()
    await expect(page.locator('body')).not.toHaveAttribute('data-scroll-locked')
    await item.press('Enter')
    const dialog = page.getByRole(
      action === 'Delete' ? 'alertdialog' : 'dialog',
    )
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
})

test('supports the full-page media browsing and mutation workflow', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.goto('/github/pagescms/fixture/main/media/default')

  await expect(page.getByRole('radio', { name: 'Grid view' })).toBeChecked()
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
  await expect(page.getByText('Library', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Library/ })).toHaveCSS(
    'cursor',
    'pointer',
  )
  await expect(
    page.locator('[data-media-path="public/images/hero.svg"]'),
  ).toHaveCSS('cursor', 'grab')

  await page.getByRole('radio', { name: 'List view' }).click()
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible()
  await page.getByRole('radio', { name: 'Grid view' }).click()

  await page.getByRole('button', { name: /Library/ }).click()
  await expect(page).toHaveURL(/path=public%2Fimages%2FLibrary/)
  await expect(page.getByText('nested.svg', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Media' }).click()

  await page.getByRole('button', { name: 'New folder' }).click()
  const folderDialog = page.getByRole('dialog', { name: 'New folder' })
  await folderDialog.getByPlaceholder('Folder name').fill('Uploads')
  await folderDialog.getByRole('button', { name: 'Create folder' }).click()
  await expect(page.getByText('Uploads', { exact: true })).toBeVisible()
  await expect(folderDialog).toHaveCount(0)

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

  await expect(
    page.getByRole('button', { name: 'Actions for renamed.svg' }),
  ).toBeFocused()

  const source = page.locator('[data-media-path="public/images/renamed.svg"]')
  const destination = page.locator('[data-media-path="public/images/Uploads"]')
  await expect(source).toHaveCSS('cursor', 'grab')
  const sourceBox = await source.boundingBox()
  const destinationBox = await destination.boundingBox()
  expect(sourceBox).not.toBeNull()
  expect(destinationBox).not.toBeNull()
  await source.hover()
  await page.mouse.down()
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2 + 12,
    sourceBox!.y + sourceBox!.height / 2,
    { steps: 2 },
  )
  await expect(source).toHaveAttribute('data-dragging', 'true')
  await page.mouse.move(
    destinationBox!.x + destinationBox!.width / 2,
    destinationBox!.y + destinationBox!.height / 2,
    { steps: 12 },
  )
  await expect(page.locator('[data-media-drag-overlay]')).toBeVisible()
  const sourceBoxWhileDragging = await source.boundingBox()
  expect(sourceBoxWhileDragging).toEqual(sourceBox)
  await expect(source).toHaveCSS('opacity', '1')
  await expect(destination).toHaveAttribute('data-drop-active', 'true')
  await page.mouse.up()
  await expect(page.getByText('renamed.svg', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Upload', exact: true }),
  ).toBeEnabled()

  // dnd-kit briefly suppresses clicks after dropping a pointer drag.
  await expect(async () => {
    await page.getByRole('button', { name: /Uploads/ }).click()
    await expect(page).toHaveURL(/path=public%2Fimages%2FUploads/, {
      timeout: 250,
    })
  }).toPass({ timeout: 5_000 })
  await expect(page.getByText('renamed.svg', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Actions for renamed.svg' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const deleteDialog = page.getByRole('alertdialog')
  await deleteDialog.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('renamed.svg', { exact: true })).toHaveCount(0)
  await expect(page.getByText('No media yet', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Media', exact: true }),
  ).toBeFocused()
})

test('keeps the file in place when a destination cannot load and lets the user retry', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/media/default')
  await page.getByRole('button', { name: 'Actions for hero.svg' }).click()
  await page.getByRole('menuitem', { name: 'Move to…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Move hero.svg' })
  const reads = '**/api/media?**'
  await page.route(reads, (route) => route.abort())
  await dialog.getByRole('treeitem', { name: 'Library' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Could not load media.')
  await expect(
    dialog.getByRole('button', { name: 'Move', exact: true }),
  ).toBeDisabled()
  await page.unroute(reads)
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await expect(
    dialog.getByRole('button', { name: 'Move', exact: true }),
  ).toBeEnabled()
  await dialog.getByRole('treeitem', { name: 'Media', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: 'Move', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Actions for hero.svg' }),
  ).toBeFocused()
})

test('expands nested destinations in place and moves into a selected subfolder', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/media/default')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'New folder' }).click()
  const create = page.getByRole('dialog', { name: 'New folder' })
  await create.getByPlaceholder('Folder name').fill('Archive')
  await create.getByRole('button', { name: 'Create folder' }).click()
  await expect(create).toHaveCount(0)
  await page.getByRole('button', { name: 'Media', exact: true }).click()
  await page.getByRole('button', { name: 'Actions for hero.svg' }).click()
  await page.getByRole('menuitem', { name: 'Move to…' }).click()
  const tree = page.getByRole('tree')
  const library = tree.getByRole('treeitem', { name: 'Library', exact: true })
  const archive = tree.getByRole('treeitem', { name: 'Archive', exact: true })
  await expect(archive).toHaveCount(0)
  await library.locator('[data-disclosure]').click()
  await expect(archive).toHaveAttribute('aria-level', '3')
  await expect(tree.getByRole('treeitem', { name: 'Media' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await library.locator('[data-disclosure]').click()
  await expect(archive).toHaveCount(0)
  await tree.press('ArrowRight')
  await tree.press('ArrowRight')
  await tree.press('Enter')
  await expect(archive).toHaveAttribute('aria-selected', 'true')
  await library.locator('[data-disclosure]').click()
  await expect(
    page.getByRole('button', { name: 'Move', exact: true }),
  ).toBeDisabled()
  await library.locator('[data-disclosure]').click()
  await archive.click()
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(tree).toHaveCount(0)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Actions for hero.svg' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Actions for hero.svg' }).click()
  await page.getByRole('menuitem', { name: 'Move to…' }).click()
  await expect(archive).toHaveAttribute('aria-selected', 'true')
  await expect(library).toHaveAttribute('aria-expanded', 'true')
})

for (const view of ['Grid', 'List']) {
  test(`moves a file by menu and breadcrumb in ${view} view`, async ({
    page,
  }, testInfo) => {
    if (view === 'Grid') await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/github/pagescms/fixture/main/media/default')
    await page.getByRole('radio', { name: view + ' view' }).click()
    if (view === 'List')
      await expect(
        page.getByRole('columnheader', { name: 'Name' }),
      ).toBeVisible()
    const destinations: string[] = []
    page.on('request', (request) => {
      if (
        request.method() === 'PATCH' &&
        new URL(request.url()).pathname === '/api/media/files/path'
      )
        destinations.push(request.postDataJSON().destination)
    })

    await page
      .getByRole('button', { name: 'Actions for hero.svg' })
      .press('Enter')
    await page.getByRole('menuitem', { name: 'Move to…' }).press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Move hero.svg' })
    const submit = dialog.getByRole('button', { name: 'Move', exact: true })
    await expect(submit).toBeDisabled()
    const tree = dialog.getByRole('tree')
    await tree.press('ArrowDown')
    await tree.press('Enter')
    await expect(
      tree.getByRole('treeitem', { name: 'Library' }),
    ).toHaveAttribute('aria-selected', 'true')
    await expect(submit).toBeEnabled()
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
    const cancelBox = (await cancel.boundingBox())!
    const moveBox = (await submit.boundingBox())!
    if (view === 'Grid') expect(moveBox.y).toBeLessThan(cancelBox.y)
    else expect(cancelBox.x).toBeLessThan(moveBox.x)
    await dialog.screenshot({ path: testInfo.outputPath('move-picker.png') })
    await submit.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(
      page.locator('[data-media-path="public/images/hero.svg"]'),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    const file = page.locator(
      '[data-media-path="public/images/Library/hero.svg"]',
    )
    const trail = page.locator('[data-slot="repository-page-header"] nav')
    for (const target of [
      trail.getByText('Library', { exact: true }),
      trail.getByRole('button', { name: 'Media' }),
    ]) {
      await file.scrollIntoViewIfNeeded()
      const box = (await file.boundingBox())!
      const label =
        view === 'List'
          ? (await file.locator('[data-media-drag-label]').boundingBox())!
          : box
      const isRoot = (await target.getAttribute('aria-label')) === 'Media'
      const startX =
        view === 'List' && isRoot
          ? box.x + box.width / 2
          : label.x + label.width * 0.7
      const startY = label.y + label.height * 0.4
      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(startX + 12, startY, { steps: 2 })
      const preview = page.locator('[data-media-drag-overlay]')
      await expect(preview).toBeVisible()
      // Move again after the activation threshold so both axes have a known delta.
      await page.mouse.move(startX + 24, startY - 7)
      const bounds = (await preview.boundingBox())!
      if (view === 'List') {
        await expect(preview).toHaveText('hero.svg')
        await expect(preview.locator('img')).toHaveCount(1)
        await expect(preview.locator('[aria-haspopup="menu"]')).toHaveCount(0)
        expect(bounds.width).toBeCloseTo(label.width, 0)
        expect(bounds.height).toBeCloseTo(label.height, 0)
        const expectedLeft = isRoot ? startX - label.width / 2 : label.x
        expect(Math.abs(bounds.x - (expectedLeft + 24))).toBeLessThan(2)
        expect(Math.abs(bounds.y - (label.y - 7))).toBeLessThan(2)
      } else {
        expect(bounds.width).toBeCloseTo(box.width, 0)
        expect(bounds.height).toBeCloseTo(box.height, 0)
        expect(Math.abs(bounds.x - (box.x + 24))).toBeLessThan(2)
        expect(Math.abs(bounds.y - (box.y - 7))).toBeLessThan(2)
      }
      await expect(preview).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      const dest = (await target.boundingBox())!
      await page.mouse.move(dest.x + dest.width / 2, dest.y + dest.height / 2, {
        steps: 8,
      })
      if (isRoot) {
        await expect(target.locator('[data-drop-active]')).toBeVisible()
        await page.screenshot({ path: testInfo.outputPath('drag-preview.png') })
      }
      await page.mouse.up()
      await expect(preview).toHaveCount(0)
      if (!isRoot) {
        await expect(file).toBeVisible()
        expect(destinations).toEqual(['public/images/Library'])
      }
    }
    await expect(file).toHaveCount(0)
    await expect(page).toHaveURL(/path=public%2Fimages%2FLibrary/)
    expect(destinations).toEqual(['public/images/Library', 'public/images'])
    await expect(async () => {
      await trail.getByRole('button', { name: 'Media' }).click()
      await expect(
        page.getByRole('button', { name: 'Actions for hero.svg' }),
      ).toBeVisible({ timeout: 500 })
    }).toPass()
  })
}

test('uses the same media browser inside the rich-text image picker', async ({
  page,
}) => {
  await page.goto(
    '/github/pagescms/fixture/main/collection/posts/entry/content/posts/hello.md',
  )

  await page.locator('.ProseMirror').waitFor()
  await page.getByRole('radio', { name: 'Source', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Body source', exact: true })
  const originalSource = await source.inputValue()
  await source.fill(`/\n\n${originalSource}`)
  await page.getByRole('radio', { name: 'Editor', exact: true }).click()
  const body = page.locator('.ProseMirror')
  await body.locator('p').first().click()
  await body.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End')
  await body.pressSequentially('Image')
  await page.getByRole('button', { name: 'Image', exact: true }).click()

  const picker = page.getByRole('dialog', { name: 'Choose an image' })
  await expect(picker).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Image', exact: true }),
  ).toHaveCount(0)
  await expect(picker).toHaveCSS('overflow', 'hidden')
  await expect(
    picker.locator('[data-slot="scroll-area-viewport"]'),
  ).toBeVisible()
  await expect(picker.getByRole('radio', { name: 'Grid view' })).toBeChecked()
  const fileActions = picker.getByRole('button', {
    name: 'Actions for hero.svg',
  })
  await fileActions.press('Enter')
  await page.getByRole('menuitem', { name: 'Rename' }).press('Enter')
  const rename = page.getByRole('dialog', { name: 'Rename file' })
  await expect(rename.getByRole('textbox', { name: 'Filename' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(fileActions).toBeFocused()
  await picker.getByRole('button', { name: /Library/ }).click()
  await expect(picker.getByText('Library', { exact: true })).toBeVisible()
  await picker.getByRole('button', { name: 'Media' }).click()
  await picker
    .getByRole('button', { name: /hero.svg/ })
    .first()
    .click()
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('button', { name: 'Select' })).toBeEnabled()
  await picker.getByRole('button', { name: 'Select' }).click()
  await expect(picker).toHaveCount(0)
  await expect(body.locator('img')).toHaveCount(1)
})
