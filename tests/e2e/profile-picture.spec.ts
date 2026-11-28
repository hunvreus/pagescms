import { createClient } from '@libsql/client'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './test'

test.setTimeout(60_000)

async function dropPicture(
  page: Page,
  target: Locator,
  pictures: {
    name: string
    type: string
    base64: string
  }[],
) {
  await expect(target).toBeEnabled()
  const transfer = await page.evaluateHandle((files) => {
    const data = new DataTransfer()
    for (const file of files) {
      const bytes = Uint8Array.from(atob(file.base64), (byte) =>
        byte.charCodeAt(0),
      )
      data.items.add(new File([bytes], file.name, { type: file.type }))
    }
    return data
  }, pictures)
  try {
    await target.dispatchEvent('dragover', { dataTransfer: transfer })
    await expect(target).toHaveAttribute('data-active', 'true')
    await target.dispatchEvent('drop', { dataTransfer: transfer })
  } finally {
    await transfer.dispose()
  }
}

for (const destination of ['/onboarding', '/settings']) {
  test(`the avatar supports choosing and dropping a picture on ${destination}`, async ({
    page,
  }) => {
    const database = createClient({ url: process.env.E2E_DATABASE_URL! })
    try {
      if (destination === '/onboarding')
        await database.execute(
          "update user set onboarding_completed_at = null where id = 'playwright-user'",
        )
      await page.goto(destination)
      const avatar = page.getByRole('button', {
        name: 'Upload profile picture',
        exact: true,
      })
      await expect(avatar).toBeEnabled()
      await expect(
        page.getByRole('button', { name: 'Upload', exact: true }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Remove picture', exact: true }),
      ).toHaveCount(0)
      const undo = page.getByRole('button', {
        name: 'Reset picture',
        exact: true,
      })
      await expect(undo).toHaveCount(0)
      const messages =
        destination === '/settings' ? page.locator('[data-sonner-toast]') : page
      const pictures = await page.evaluate(() =>
        ['#2463eb', '#ea580c'].map((color) => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 32
          canvas.getContext('2d')!.fillStyle = color
          canvas.getContext('2d')!.fillRect(0, 0, 32, 32)
          return canvas.toDataURL('image/png').split(',')[1]
        }),
      )

      const chooser = page.waitForEvent('filechooser')
      await avatar.press('Enter')
      await (
        await chooser
      ).setFiles({
        name: 'first.png',
        mimeType: 'image/png',
        buffer: Buffer.from(pictures[0], 'base64'),
      })
      await expect(avatar).toHaveAttribute('aria-busy', 'false')
      await expect(avatar.locator('img')).toHaveAttribute(
        'src',
        /^data:image\/(?:webp|png);base64,/,
      )
      const first = await avatar.locator('img').getAttribute('src')
      const remove = page.getByRole('button', {
        name: 'Remove picture',
        exact: true,
      })
      await expect(remove).toBeVisible()

      const invalid = {
        name: 'invalid.svg',
        type: 'image/svg+xml',
        base64: Buffer.from('<svg/>').toString('base64'),
      }
      await dropPicture(page, avatar, [invalid])
      await expect(
        messages.getByText('Choose a PNG, JPEG or WebP picture.'),
      ).toBeVisible()
      if (destination === '/onboarding') {
        await expect(avatar).toHaveAttribute('aria-invalid', 'true')
        await expect(avatar).toHaveAttribute(
          'aria-describedby',
          'profile-picture-error',
        )
        await expect(
          page.locator('[data-slot="field"]').filter({ has: avatar }),
        ).toHaveAttribute('data-invalid', 'true')
      }
      await expect(avatar.locator('img')).toHaveAttribute('src', first!)
      const replacement = {
        name: 'second.png',
        type: 'image/png',
        base64: pictures[1],
      }
      await dropPicture(page, avatar, [replacement, replacement])
      await expect(
        messages.getByText('Choose one picture at a time.'),
      ).toBeVisible()
      await dropPicture(page, avatar, [replacement])
      await expect(avatar).toHaveAttribute('aria-busy', 'false')
      await expect(avatar.locator('img')).not.toHaveAttribute('src', first!)
      await expect(
        (destination === '/settings'
          ? page.getByRole('region', { name: 'Profile', exact: true })
          : page
        ).getByRole('alert'),
      ).toHaveCount(0)

      await avatar.press('Tab')
      await page.mouse.move(0, 0)
      const overlay = avatar.locator('[data-slot="profile-picture-overlay"]')
      await expect(overlay).toHaveCSS('opacity', '0')
      await avatar.hover()
      await expect(overlay).toHaveCSS('opacity', '1')
      await page.mouse.move(0, 0)
      const muted = await remove.evaluate(
        (element) => getComputedStyle(element).color,
      )
      await remove.hover()
      await expect
        .poll(() =>
          remove.evaluate((element) => getComputedStyle(element).color),
        )
        .not.toBe(muted)
      await remove.click()
      if (destination === '/settings') {
        const dialog = page.getByRole('alertdialog', {
          name: 'Remove picture?',
        })
        await expect(dialog).toBeVisible()
        await expect(dialog).toHaveCSS('opacity', '1')
        await dialog
          .getByRole('button', { name: 'Remove picture', exact: true })
          .click()
      }
      await expect(remove).toHaveCount(0)
      await expect(avatar.locator('img')).toHaveCount(0)
      await expect(undo).toHaveCount(0)
      const name = page.getByRole('textbox', {
        name: destination === '/onboarding' ? 'Display name' : 'Name',
        exact: true,
      })
      await name.fill('Picture Editor')
      if (destination === '/onboarding') {
        await page
          .getByRole('button', { name: 'Continue', exact: true })
          .click()
        await expect(page).toHaveURL('/')
        await expect(page.getByPlaceholder('Search by name')).toBeVisible()
        await page.goto('/settings')
        await expect(undo).toHaveCount(0)
      } else {
        await name.press('Enter')
        await expect(name).toHaveAttribute('aria-busy', 'false')
        await expect(
          page
            .locator('[data-sonner-toast]')
            .filter({ hasText: 'Profile updated' })
            .last(),
        ).toBeVisible()
        await expect(undo).toHaveCount(0)
      }
      await expect(remove).toHaveCount(0)
      await page.reload()
      await expect(undo).toHaveCount(0)
      await expect(remove).toHaveCount(0)

      // A failed immediate upload keeps the confirmed avatar until retry succeeds.
      if (destination === '/settings') {
        await page.route('**/api/account', async (route) => {
          if (route.request().method() === 'PATCH') await route.abort('failed')
          else await route.continue()
        })
        await dropPicture(page, avatar, [replacement])
        const profile = page.getByRole('region', {
          name: 'Profile',
          exact: true,
        })
        const error = page
          .locator('[data-sonner-toast]')
          .filter({ hasText: 'Could not save your picture' })
        await expect(error).toBeVisible()
        await expect(profile.getByRole('alert')).toHaveCount(0)
        await expect(avatar).toHaveAttribute('aria-invalid', 'true')
        await expect(remove).toHaveCount(0)
        await expect(avatar.locator('img')).toHaveCount(0)
        await page.unroute('**/api/account')
        await error.getByRole('button', { name: 'Retry', exact: true }).click()
        await expect(avatar).toHaveAttribute('aria-busy', 'false')
        await expect(name).toHaveValue('Picture Editor')
        await expect(avatar).toHaveAttribute('aria-invalid', 'false')
        await expect(undo).toHaveCount(0)
        await expect(remove).toBeVisible()
        await expect(avatar.locator('img')).toHaveAttribute(
          'src',
          /^data:image\/(?:webp|png);base64,/,
        )
        await page.reload()
        await expect(remove).toBeVisible()
      }
    } finally {
      database.close()
    }
  })
}
