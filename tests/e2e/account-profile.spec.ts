import { createClient } from '@libsql/client'
import type { Route } from '@playwright/test'
import { expect, test } from './test'

test('profile names persist after Save or Enter and show confirmation', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    const profile = page.getByRole('region', { name: 'Profile', exact: true })
    const save = profile.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toBeDisabled()
    const name = profile.getByRole('textbox', { name: 'Name', exact: true })
    await name.fill('  Latest name  ')
    await name.blur()
    await expect(save).toBeEnabled()
    expect(
      (
        await database.execute(
          "select name from user where id = 'playwright-user'",
        )
      ).rows[0].name,
    ).toBe('Playwright Editor')
    const toast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: 'Profile updated' })
    await expect(toast).toHaveCount(0)
    await save.click()
    await expect
      .poll(
        async () =>
          (
            await database.execute(
              "select name from user where id = 'playwright-user'",
            )
          ).rows[0].name,
      )
      .toBe('Latest name')
    await expect(name).toHaveValue('Latest name')
    await expect(toast).toHaveCount(1)
    await expect(name).toHaveAttribute('aria-invalid', 'false')
    await name.fill('Another name')
    await name.press('Enter')
    await expect
      .poll(
        async () =>
          (
            await database.execute(
              "select name from user where id = 'playwright-user'",
            )
          ).rows[0].name,
      )
      .toBe('Another name')
    await expect(toast).toHaveCount(1)
    await page.getByRole('button', { name: 'User menu', exact: true }).click()
    await expect(page.getByRole('menu')).toContainText('Another name')
  } finally {
    database.close()
  }
})

test('picture removal requires confirmation and retains the saved picture until confirmed by the server', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    const picture = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 32
      canvas.getContext('2d')!.fillRect(0, 0, 32, 32)
      return canvas.toDataURL('image/png')
    })
    await database.execute({
      sql: "update user set image = ? where id = 'playwright-user'",
      args: [picture],
    })
    await page.goto('/settings')
    await page
      .getByRole('button', { name: 'Remove picture', exact: true })
      .click()
    const dialog = page.getByRole('alertdialog', { name: 'Remove picture?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Remove picture', exact: true }),
    ).toBeFocused()
    expect(
      (
        await database.execute(
          "select image from user where id = 'playwright-user'",
        )
      ).rows[0].image,
    ).toBe(picture)
    await page
      .getByRole('button', { name: 'Remove picture', exact: true })
      .click()
    let release!: (route: Route) => void
    const held = new Promise<Route>((resolve) => {
      release = resolve
    })
    await page.route('**/api/account', async (route) => {
      if (route.request().method() === 'PATCH') release(route)
      else await route.continue()
    })
    await dialog
      .getByRole('button', { name: 'Remove picture', exact: true })
      .click()
    const route = await held
    const avatar = page.getByRole('button', {
      name: 'Upload profile picture',
      exact: true,
    })
    await expect(avatar).toHaveAttribute('aria-busy', 'true')
    await expect(avatar.locator('img')).toHaveAttribute('src', picture)
    await expect(
      page
        .locator('[data-sonner-toast]')
        .filter({ hasText: 'Profile updated' }),
    ).toHaveCount(0)
    await route.continue()
    await page.unroute('**/api/account')
    await expect
      .poll(
        async () =>
          (
            await database.execute(
              "select image from user where id = 'playwright-user'",
            )
          ).rows[0].image,
      )
      .toBeNull()
    await expect(
      page.getByRole('button', {
        name: 'Reset picture',
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(avatar.locator('img')).toHaveCount(0)
    await expect(
      page
        .locator('[data-sonner-toast]')
        .filter({ hasText: 'Profile updated' }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('button', { name: 'Remove picture', exact: true }),
    ).toHaveCount(0)
  } finally {
    database.close()
  }
})

for (const appearance of ['desktop-light', 'desktop-dark', 'mobile-dark']) {
  test(`invalid names keep the field stationary with a compact toast (${appearance})`, async ({
    page,
  }) => {
    const database = createClient({ url: process.env.E2E_DATABASE_URL! })
    try {
      await page.setViewportSize({
        width: appearance === 'mobile-dark' ? 390 : 1280,
        height: 844,
      })
      await page.emulateMedia({
        colorScheme: appearance === 'desktop-light' ? 'light' : 'dark',
      })
      await page.goto('/settings')
      await page.waitForLoadState('networkidle')
      const profile = page.getByRole('region', { name: 'Profile', exact: true })
      const name = page.getByRole('textbox', { name: 'Name', exact: true })
      await expect(name).toBeVisible()
      const group = profile
        .locator('[data-slot="input-group"]')
        .filter({ has: name })
      const save = profile.getByRole('button', { name: 'Save', exact: true })
      const bounds = await name.boundingBox()
      await expect(group).toHaveCSS('border-top-width', '1px')
      await name.fill('   ')
      await save.click()
      await expect(name).toHaveAttribute('aria-invalid', 'true')
      const error = page
        .locator('[data-sonner-toast]')
        .filter({ hasText: 'Name cannot be empty.' })
      await expect(error).toBeVisible()
      await expect(error).toHaveAttribute('data-mounted', 'true')
      const destructive = await error.evaluate((element) => {
        const sample = document.createElement('span')
        sample.style.color = 'var(--destructive)'
        element.appendChild(sample)
        const color = getComputedStyle(sample).color
        sample.remove()
        return color
      })
      await expect(error.locator('[data-icon]')).toHaveCSS('color', destructive)
      await expect(error.locator('[data-title]')).toHaveCSS(
        'color',
        destructive,
      )
      const toastBounds = (await error.boundingBox())!
      expect(toastBounds.width).toBeLessThan(250)
      expect(toastBounds.height).toBeLessThan(48)
      await expect(profile.getByRole('alert')).toHaveCount(0)
      await expect(name).toHaveValue('   ')
      expect(await name.boundingBox()).toEqual(bounds)
      await expect(group).toHaveCSS('border-top-width', '1px')
      expect(
        (
          await database.execute(
            "select name from user where id = 'playwright-user'",
          )
        ).rows[0].name,
      ).toBe('Playwright Editor')
      await name.fill('Corrected name')
      await save.click()
      await expect(
        page
          .locator('[data-sonner-toast]')
          .filter({ hasText: 'Profile updated' }),
      ).toBeVisible()
      await expect(name).toHaveAttribute('aria-invalid', 'false')
      await expect(error).toHaveCount(0)
      await page.reload()
      await expect(name).toHaveValue('Corrected name')
    } finally {
      database.close()
    }
  })
}

test('failed profile saves mark the name and preserve its value for toast Retry', async ({
  page,
}) => {
  await page.goto('/settings')
  await page.waitForLoadState('networkidle')
  await page.route('**/api/account', async (route) => {
    if (route.request().method() === 'PATCH') await route.abort('failed')
    else await route.continue()
  })
  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  await name.fill('Retry profile')
  await name.press('Enter')
  const profile = page.getByRole('region', { name: 'Profile', exact: true })
  const error = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: 'Could not save your name' })
  await expect(error).toBeVisible()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await expect(profile.getByRole('alert')).toHaveCount(0)
  await name.blur()
  await expect(name).toHaveAttribute('aria-busy', 'false')
  await expect(name).toHaveValue('Retry profile')
  await expect(name).toBeEnabled()
  await page.unroute('**/api/account')
  await error.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(name).toHaveAttribute('aria-invalid', 'false')
  await page.reload()
  await expect(name).toHaveValue('Retry profile')
})

test('account deletion requires email confirmation, supports Cancel, revokes sessions and leaves repositories intact', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await page.goto('/settings')
    await page
      .getByRole('button', { name: 'Delete account', exact: true })
      .click()
    const dialog = page.getByRole('alertdialog', {
      name: 'Delete your account?',
    })
    await expect(dialog).toBeVisible()
    const remove = dialog.getByRole('button', {
      name: 'Delete account',
      exact: true,
    })
    await expect(remove).toBeDisabled()
    await dialog.getByRole('textbox').fill('someone@example.com')
    await expect(remove).toBeDisabled()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(
      (
        await database.execute(
          "select id from user where id = 'playwright-user'",
        )
      ).rows,
    ).toHaveLength(1)
    await page
      .getByRole('button', { name: 'Delete account', exact: true })
      .click()
    await dialog.getByRole('textbox').fill('editor@example.com')
    await dialog
      .getByRole('button', { name: 'Delete account', exact: true })
      .click()
    await expect(page).toHaveURL('/sign-in')
    await expect(
      page.getByText('Your account has been deleted.', { exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByText('Your account has been deleted.', { exact: true }),
    ).toHaveCount(0)
    expect(
      (
        await database.execute(
          "select id from user where id = 'playwright-user'",
        )
      ).rows,
    ).toHaveLength(0)
    expect(
      (
        await database.execute(
          "select id from session where user_id = 'playwright-user'",
        )
      ).rows,
    ).toHaveLength(0)
    expect(
      (
        await database.execute(
          "select id from account where user_id = 'playwright-user'",
        )
      ).rows,
    ).toHaveLength(0)
    expect(
      (await database.execute('select id from repository')).rows.length,
    ).toBeGreaterThan(0)
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/sign-in/)
  } finally {
    database.close()
  }
})

test('an old session must sign in again before deleting an account', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.execute({
      sql: "update session set created_at = ? where user_id = 'playwright-user'",
      args: [Date.now() - 2 * 86400000],
    })
    await page.goto('/settings')
    await page
      .getByRole('button', { name: 'Delete account', exact: true })
      .click()
    const dialog = page.getByRole('alertdialog', {
      name: 'Delete your account?',
    })
    await dialog.getByRole('textbox').fill('editor@example.com')
    await dialog
      .getByRole('button', { name: 'Delete account', exact: true })
      .click()
    await expect(
      dialog.getByRole('button', { name: 'Sign in again' }),
    ).toBeVisible()
    expect(
      (
        await database.execute(
          "select id from user where id = 'playwright-user'",
        )
      ).rows,
    ).toHaveLength(1)
    await dialog.getByRole('button', { name: 'Sign in again' }).click()
    await expect(page).toHaveURL(/\/sign-in\?redirect=/)
  } finally {
    database.close()
  }
})
