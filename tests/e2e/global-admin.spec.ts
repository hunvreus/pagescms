import { expect, test } from './test'

test('global administration uses compact settings groups and keeps user search', async ({
  page,
}) => {
  test.skip(
    process.env.ADMIN_EMAILS !== 'editor@example.com',
    'Requires the isolated admin fixture',
  )
  await page.goto('/pagescms/fixture/main/settings')
  await expect(
    page.getByRole('heading', { name: 'Settings', exact: true }),
  ).toBeVisible()
  await page.goto('/admin')
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('heading', { name: 'Admin settings', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Overview' })).toHaveCount(0)
  const repos = page.getByRole('region', { name: 'Repositories', exact: true })
  await expect(
    repos.getByRole('columnheader', { name: 'Forge', exact: true }),
  ).toHaveCount(0)
  await expect(repos.getByRole('columnheader')).toHaveCount(4)
  await expect(
    repos.getByRole('columnheader', { name: 'Last opened', exact: true }),
  ).toBeVisible()
  await expect(repos.locator('time')).toHaveAttribute(
    'datetime',
    /^\d{4}-\d{2}-\d{2}T/,
  )
  await repos.locator('time').hover()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await expect(
    repos.getByText('pagescms/fixture', { exact: true }),
  ).toBeVisible()
  await expect(repos.getByRole('link', { name: 'Open' })).toHaveAttribute(
    'href',
    '/pagescms/fixture',
  )
  const users = page.getByRole('region', { name: 'Users', exact: true })
  const userSearch = users.getByRole('textbox', { name: 'Search users' })
  await expect(users.locator('[data-slot="badge"]')).toHaveCount(0)
  await expect(repos.locator('[data-slot="badge"]')).toHaveCount(0)
  for (const section of [users, repos]) {
    await expect(section.getByText(/Showing \d+ to \d+ of \d+/)).toHaveCount(0)
    await expect(
      section.getByRole('button', { name: 'Previous', exact: true }),
    ).toHaveCount(0)
    await expect(
      section.getByRole('button', { name: 'Next', exact: true }),
    ).toHaveCount(0)
  }
  const searchGroup = userSearch.locator('..')
  await expect(searchGroup).toHaveAttribute('data-slot', 'input-group')
  await expect(searchGroup).toHaveCSS('height', '28px')
  await expect(
    users.getByRole('button', { name: 'Revoke all sessions' }),
  ).toHaveCSS('height', '28px')
  await userSearch.focus()
  await expect(
    users.getByText('editor@example.com', { exact: true }),
  ).toBeVisible()
  await page.route('**/_serverFn/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800))
    await route.continue()
  })
  await users
    .getByRole('textbox', { name: 'Search users' })
    .fill('no-such-account')
  await expect(users.locator('[aria-label="Filtering users"]')).toBeVisible()
  await expect(users.getByRole('table')).toHaveAttribute('aria-busy', 'true')
  await expect(
    users.getByText('editor@example.com', { exact: true }),
  ).toBeVisible()
  await expect(userSearch).toBeFocused()
  await expect(
    users.getByRole('button', { name: 'Search', exact: true }),
  ).toHaveCount(0)
  await expect(page).toHaveURL(/query=no-such-account/)
  await expect(
    users.getByRole('button', { name: 'Previous', exact: true }),
  ).toHaveCount(0)
  await expect(users.locator('[aria-label="Filtering users"]')).toHaveCount(0)
  await expect(users.getByRole('table')).toHaveAttribute('aria-busy', 'false')
  await page.unroute('**/_serverFn/**')
  await expect(userSearch).toBeFocused()
  await expect(
    users.getByText('editor@example.com', { exact: true }),
  ).toHaveCount(0)
  const cache = page.getByRole('region', { name: 'Cache', exact: true })
  await cache.getByRole('button', { name: 'Clear all', exact: true }).click()
  const confirmation = page.getByRole('alertdialog', {
    name: 'Clear all cache?',
  })
  await expect(confirmation).toBeVisible()
  await confirmation
    .getByRole('button', { name: 'Confirm', exact: true })
    .click()
  await expect(
    cache.getByRole('button', { name: 'Clear all', exact: true }),
  ).toBeDisabled()
  await expect(
    repos.getByText('pagescms/fixture', { exact: true }),
  ).toBeVisible()
  await repos
    .getByRole('textbox', { name: 'Search repositories' })
    .fill('missing-repository')
  await expect(
    repos.getByRole('button', { name: 'Search repositories' }),
  ).toHaveCount(0)
  await expect(repos.getByText('No repositories found.')).toBeVisible()
  await expect(page).toHaveURL(
    /query=no-such-account.*repoQuery=missing-repository/,
  )
  await page.route('**/_serverFn/**', (route) => route.abort('failed'))
  await userSearch.fill('editor')
  await expect(users.locator('[aria-label="Filtering users"]')).toBeVisible()
  await expect(users.locator('[aria-label="Filtering users"]')).toHaveCount(0, {
    timeout: 15000,
  })
  await expect(
    users.getByRole('button', { name: 'Next', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/query=no-such-account/)
  await expect(userSearch).toBeFocused()
})
