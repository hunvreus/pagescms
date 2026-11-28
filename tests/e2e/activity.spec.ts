import { createClient } from '@libsql/client'
import { expect, test } from './test'

const overview = '/github/pagescms/fixture/main'
test.setTimeout(60_000)
test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) =>
    console.error(`[activity browser] ${error.stack}`),
  )
})

test('retries a failed next activity page without losing the current events', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.batch(
      Array.from({ length: 11 }, (_, index) => ({
        sql: `insert into activity (repository_id, id, source, owner, repo, branch, kind, area, resource, path, origin, occurred_at) values ((select id from repository where source = 'github.com' and external_id = '1'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `retry-${index}`,
          'github.com',
          'pagescms',
          'fixture',
          'main',
          'edited',
          'collection',
          'posts',
          `content/posts/retry-${index}.md`,
          'webhook',
          Date.now() - index * 1000,
        ],
      })),
      'write',
    )
  } finally {
    database.close()
  }
  await page.goto(overview)
  const section = page.getByRole('region', { name: 'Activity', exact: true })
  await expect(section.getByRole('listitem')).toHaveCount(5)
  await section.getByRole('button', { name: 'Show more' }).click()
  await expect(section.getByRole('listitem')).toHaveCount(10)
  await page.route('**/api/activity?**', (route) => {
    if (new URL(route.request().url()).searchParams.get('page') === '1')
      return route.abort('failed')
    return route.continue()
  })
  await section.getByRole('button', { name: 'Show more' }).click()
  await expect(section.getByRole('alert')).toHaveText(
    'Could not load more activity.',
  )
  await expect(section.getByRole('listitem')).toHaveCount(10)
  await page.unroute('**/api/activity?**')
  await section.getByRole('button', { name: 'Try again' }).click()
  await expect(section.getByRole('alert')).toHaveCount(0)
  await expect(section.getByRole('listitem')).toHaveCount(11)
})

test('activity reveals five events at a time on desktop and mobile', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.batch(
      Array.from({ length: 23 }, (_, i) => ({
        sql: `insert into activity (repository_id, id, source, owner, repo, branch, kind, area, resource, path, origin, occurred_at) values ((select id from repository where source = 'github.com' and external_id = '1'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `event-${i}`,
          'github.com',
          'pagescms',
          'fixture',
          'main',
          'edited',
          'collection',
          'posts',
          `content/posts/entry-${i}.md`,
          'webhook',
          Date.now() - (23 - i) * 60_000,
        ],
      })),
      'write',
    )
  } finally {
    database.close()
  }
  await page.goto(overview)
  const card = page.getByRole('region', {
    name: 'Activity',
    exact: true,
  })
  const list = card.getByRole('list', { name: 'Activity', exact: true })
  await expect(list.getByRole('listitem')).toHaveCount(5)
  await expect(list).toContainText('entry-22.md')
  const more = card.getByRole('button', { name: 'Show more', exact: true })
  for (const count of [10, 15, 20, 23]) {
    await more.click()
    await expect(list.getByRole('listitem')).toHaveCount(count)
  }
  await expect(more).toHaveCount(0)
  await expect(list).toContainText('entry-0.md')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('a successful editor save appears in activity', async ({ page }) => {
  await page.goto(overview)
  await expect(page.getByText('No activity yet')).toBeVisible()
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await page.getByRole('link', { name: 'Hello world', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Activity capture test')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled()
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  const list = page.getByRole('list', { name: 'Activity', exact: true })
  await expect(list).toContainText('edited Activity capture test')
  await expect(list.getByRole('listitem').first()).toContainText(
    'Playwright Editor',
  )
  await expect(list.getByRole('listitem')).toHaveCount(1)
})

test('an empty next activity page preserves the already loaded events', async ({
  page,
}) => {
  const database = createClient({ url: process.env.E2E_DATABASE_URL! })
  try {
    await database.batch(
      Array.from({ length: 11 }, (_, index) => ({
        sql: `insert into activity (repository_id, id, source, owner, repo, branch, kind, area, resource, path, origin, occurred_at) values ((select id from repository where source = 'github.com' and external_id = '1'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          `page-${index}`,
          'github.com',
          'pagescms',
          'fixture',
          'main',
          'edited',
          'collection',
          'posts',
          `content/posts/entry-${index}.md`,
          'webhook',
          Date.now() - index * 1000,
        ],
      })),
      'write',
    )
    await page.goto(overview)
    const card = page.getByRole('region', {
      name: 'Activity',
      exact: true,
    })
    await expect(card.getByRole('listitem')).toHaveCount(5)
    await database.execute({
      sql: 'delete from activity where id = ?',
      args: ['page-10'],
    })
    const more = card.getByRole('button', { name: 'Show more', exact: true })
    await more.click()
    await expect(card.getByRole('listitem')).toHaveCount(10)
    await more.click()
    await expect(card.getByRole('listitem')).toHaveCount(10)
    await expect(more).toHaveCount(0)
  } finally {
    database.close()
  }
})
