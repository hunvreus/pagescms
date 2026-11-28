import { expect, test } from './test'

test('history appends pages inside a five-row viewport and retains them when reopened', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  const trigger = page.getByRole('button', { name: 'Entry history' })
  await trigger.click()
  const menu = page.getByRole('menu')
  const entries = menu.getByRole('group', { name: 'History entries' })
  const rows = entries.getByRole('menuitem')
  await expect(rows).toHaveCount(10)
  await expect(menu.getByText('View on GitHub')).toHaveCount(0)
  const dimensions = await menu.evaluate((element) => {
    const style = getComputedStyle(element)
    const firstRow = element.querySelector<HTMLElement>(
      '[role="group"] > [role="menuitem"]',
    )
    return {
      height:
        element.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom),
      contentHeight: element.scrollHeight,
      rowHeight: firstRow?.offsetHeight,
    }
  })
  expect(dimensions.rowHeight).toBe(44)
  expect(dimensions.height).toBe(220)
  expect(dimensions.contentHeight).toBeGreaterThan(dimensions.height)
  const showMore = menu.getByRole('menuitem', {
    name: 'Show more',
    exact: true,
  })
  await expect(showMore).not.toBeInViewport()
  await menu.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(rows.last()).toBeInViewport()
  await expect(showMore).toBeInViewport()
  await showMore.hover()
  await expect(showMore).toBeFocused()
  await expect(showMore).toHaveCSS('box-shadow', 'none')
  await page.keyboard.press('Enter')
  await expect(menu).toBeVisible()
  await expect(rows).toHaveCount(20)
  await menu.getByRole('menuitem', { name: 'Show more', exact: true }).click()
  await expect(rows).toHaveCount(23)
  await expect(menu.getByRole('menuitem', { name: 'Show more' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await trigger.click()
  await expect(rows).toHaveCount(23)
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Posts', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Hello world', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Groups', exact: true }).click()
  const requests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/entries/history')
      requests.push(request.url())
  })
  await trigger.click()
  await expect(rows).toHaveCount(23)
  expect(requests).toEqual([])
})

test('a failed next page retains rows and retries the same page', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Entry history' }).click()
  const menu = page.getByRole('menu')
  const rows = menu
    .getByRole('group', { name: 'History entries' })
    .getByRole('menuitem')
  await expect(rows).toHaveCount(10)
  await page.route('**/api/entries/history**', (route) => route.abort())
  await menu.getByRole('menuitem', { name: 'Show more', exact: true }).click()
  await expect(menu.getByRole('alert')).toContainText(
    'Could not refresh history. The displayed results may be out of date.',
  )
  await expect(rows).toHaveCount(10)
  await page.unroute('**/api/entries/history**')
  await menu.getByRole('menuitem', { name: 'Try again', exact: true }).click()
  await expect(rows).toHaveCount(20)
  await expect(menu.getByRole('alert')).toHaveCount(0)
})

test('a full final page permits one empty page request before hiding show more', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/raw-code')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Entry history' }).click()
  const menu = page.getByRole('menu')
  const rows = menu
    .getByRole('group', { name: 'History entries' })
    .getByRole('menuitem')
  await expect(rows).toHaveCount(10)
  await menu.getByRole('menuitem', { name: 'Show more', exact: true }).click()
  await expect(rows).toHaveCount(20)
  await menu.getByRole('menuitem', { name: 'Show more', exact: true }).click()
  await expect(menu.getByRole('menuitem', { name: 'Show more' })).toHaveCount(0)
  await expect(rows).toHaveCount(20)
})

test('configuration history uses the same pagination for its branch', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/preview/configuration')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Entry history' }).click()
  const menu = page.getByRole('menu')
  const rows = menu
    .getByRole('group', { name: 'History entries' })
    .getByRole('menuitem')
  await expect(rows).toHaveCount(10)
  await menu.getByRole('menuitem', { name: 'Show more', exact: true }).click()
  await expect(rows).toHaveCount(13)
  await expect(menu.getByRole('menuitem', { name: 'Show more' })).toHaveCount(0)
  await expect(menu.getByText('View on GitHub')).toHaveCount(0)
})

test('a failed initial history request can be retried without closing the menu', async ({
  page,
}) => {
  await page.goto('/github/pagescms/fixture/main/file/groups')
  await page.waitForLoadState('networkidle')
  await page.route('**/api/entries/history**', (route) => route.abort())
  await page.getByRole('button', { name: 'Entry history' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('alert')).toContainText('Could not load history.')
  await page.unroute('**/api/entries/history**')
  await menu.getByRole('menuitem', { name: 'Try again', exact: true }).click()
  await expect(
    menu.getByRole('group', { name: 'History entries' }).getByRole('menuitem'),
  ).toHaveCount(10)
})
