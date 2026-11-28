import { createClient, LibsqlError } from '@libsql/client'
import { expect, test } from './test'

test('Account persists editing preferences in the database without hosted newsletter UI', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await page.goto('/settings')
    await expect(
      page.getByRole('heading', { name: 'Email updates', exact: true }),
    ).toHaveCount(0)
    const preference = page.getByRole('combobox', {
      name: 'New translations',
      exact: true,
    })
    await expect(preference).toBeEnabled()
    await preference.click()
    await page
      .getByRole('option', { name: 'Copy current language', exact: true })
      .click()
    await expect
      .poll(async () => {
        try {
          const row = (
            await database.execute(
              "SELECT preferences FROM user WHERE id='playwright-user'",
            )
          ).rows[0]
          return JSON.parse(String(row.preferences)).editing?.newTranslations
        } catch (error) {
          if (!(error instanceof LibsqlError) || error.code !== 'SQLITE_BUSY')
            throw error
          return undefined
        }
      })
      .toBe('copy')
    await page.reload()
    await expect(preference).toContainText('Copy current language')
    await preference.click()
    await page
      .getByRole('option', { name: 'Ask every time', exact: true })
      .click()
    await expect(preference).toContainText('Ask every time')
  } finally {
    database.close()
  }
})
