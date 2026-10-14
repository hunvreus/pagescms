import { expect, test } from './test'

test('history appends pages inside a three-row viewport and retains them when reopened', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  const trigger = page.getByRole('button', { name: 'Entry history' })
  await trigger.click()
  const menu = page.getByRole('menu')
  const entries = menu.getByRole('group', { name: 'History entries' })
  const rows = entries.getByRole('menuitem')
  await expect(rows).toHaveCount(10)
  await expect(menu.getByText('View on GitHub')).toHaveCount(0)
  const dimensions = await entries.evaluate((element) => ({
    height: element.clientHeight,
    contentHeight: element.scrollHeight,
    rowHeight: (element.firstElementChild as HTMLElement | null)?.offsetHeight,
  }))
  expect(dimensions.rowHeight).toBe(44)
  expect(dimensions.height).toBe(132)
  expect(dimensions.contentHeight).toBeGreaterThan(dimensions.height)
  await entries.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(rows.last()).toBeInViewport()
  await menu.getByRole('menuitem', { name: 'See more', exact: true }).click()
  await expect(menu).toBeVisible()
  await expect(rows).toHaveCount(20)
  await menu.getByRole('menuitem', { name: 'See more', exact: true }).click()
  await expect(rows).toHaveCount(23)
  await expect(menu.getByRole('menuitem', { name: 'See more' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await trigger.click()
  await expect(rows).toHaveCount(23)
})

test('a failed next page retains rows and retries the same page', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Entry history' }).click()
  const menu = page.getByRole('menu')
  const rows = menu
    .getByRole('group', { name: 'History entries' })
    .getByRole('menuitem')
  await expect(rows).toHaveCount(10)
  await page.route('**/_serverFn/**', (route) => route.abort())
  await menu.getByRole('menuitem', { name: 'See more', exact: true }).click()
  await expect(menu.getByRole('alert')).toContainText('Could not load history.')
  await expect(rows).toHaveCount(10)
  await page.unroute('**/_serverFn/**')
  await menu.getByRole('menuitem', { name: 'Try again', exact: true }).click()
  await expect(rows).toHaveCount(20)
  await expect(menu.getByRole('alert')).toHaveCount(0)
})

test('a full final page permits one empty page request before hiding see more', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/raw-code')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Entry history' }).click()
  const menu = page.getByRole('menu')
  const rows = menu
    .getByRole('group', { name: 'History entries' })
    .getByRole('menuitem')
  await expect(rows).toHaveCount(10)
  await menu.getByRole('menuitem', { name: 'See more', exact: true }).click()
  await expect(rows).toHaveCount(20)
  await menu.getByRole('menuitem', { name: 'See more', exact: true }).click()
  await expect(menu.getByRole('menuitem', { name: 'See more' })).toHaveCount(0)
  await expect(rows).toHaveCount(20)
})

test('configuration history uses the same pagination for its branch', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/preview/configuration')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Entry history' }).click()
  const menu = page.getByRole('menu')
  const rows = menu
    .getByRole('group', { name: 'History entries' })
    .getByRole('menuitem')
  await expect(rows).toHaveCount(10)
  await menu.getByRole('menuitem', { name: 'See more', exact: true }).click()
  await expect(rows).toHaveCount(13)
  await expect(menu.getByRole('menuitem', { name: 'See more' })).toHaveCount(0)
  await expect(menu.getByText('View on GitHub')).toHaveCount(0)
})

test('a failed initial history request can be retried without closing the menu', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  await page.route('**/_serverFn/**', (route) => route.abort())
  await page.getByRole('button', { name: 'Entry history' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('alert')).toContainText('Could not load history.')
  await page.unroute('**/_serverFn/**')
  await menu.getByRole('menuitem', { name: 'Try again', exact: true }).click()
  await expect(
    menu.getByRole('group', { name: 'History entries' }).getByRole('menuitem'),
  ).toHaveCount(10)
})
