import { encryptFixtureToken } from './auth-fixture'
import { createClient } from '@libsql/client'
import { expect, test } from './test'

test.setTimeout(60_000)

test('repository search displays remote results outside the initially displayed rows', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.execute({
      sql: "update account set access_token = ? where user_id = 'playwright-user'",
      args: [await encryptFixtureToken('searchable-repositories-token')],
    })
  } finally {
    database.close()
  }
  await page.goto('/')
  const projects = page
    .getByRole('heading', { name: 'Open a project', exact: true })
    .locator('..')
  await expect(
    projects.getByRole('link', { name: 'fixture', exact: true }),
  ).toBeVisible()
  await page.waitForLoadState('networkidle')
  const remote = projects.getByRole('link', {
    name: 'remote-project',
    exact: true,
  })
  await expect(remote).toHaveCount(0)
  const search = projects.getByPlaceholder('Search by name')
  await search.fill('remote-project')
  await expect(remote).toBeVisible()
  await expect(
    projects.getByRole('link', { name: 'fixture', exact: true }),
  ).toHaveCount(0)
  await search.fill('no-matching-repository')
  await expect(
    projects.getByText('No matching repositories', { exact: true }),
  ).toBeVisible()
})

test('clearing a remote repository search restores cached rows without a false empty state', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.execute({
      sql: "update account set access_token = ? where user_id = 'playwright-user'",
      args: [await encryptFixtureToken('searchable-repositories-token')],
    })
  } finally {
    database.close()
  }
  await page.goto('/')
  await expect(
    page.getByRole('link', { name: 'fixture', exact: true }),
  ).toBeVisible()
  const search = page.getByPlaceholder('Search by name')
  await search.fill('no-matching-repository')
  await expect(
    page.getByText('No matching repositories', { exact: true }),
  ).toBeVisible()
  await page.evaluate(() => {
    const messages: string[] = []
    const observer = new MutationObserver(() => {
      if (document.body.textContent.includes('No repositories available'))
        messages.push('false-empty')
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    })
    Object.assign(window, { emptyStateCheck: { observer, messages } })
  })
  await search.fill('')
  await expect(
    page.getByRole('link', { name: 'fixture', exact: true }),
  ).toBeVisible({ timeout: 400 })
  const messages = await page.evaluate(() => {
    const check = (
      window as Window & {
        emptyStateCheck?: { observer: MutationObserver; messages: string[] }
      }
    ).emptyStateCheck
    if (!check) throw new Error('Empty-state observation was not installed')
    check.observer.disconnect()
    return check.messages
  })
  expect(messages).toEqual([])
})
