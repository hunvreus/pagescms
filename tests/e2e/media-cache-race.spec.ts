import type { APIResponse, Route } from '@playwright/test'
import { expect, test } from './test'

test.setTimeout(60_000)
test('a move refreshes a destination whose first read began before the commit', async ({
  page,
}) => {
  await page.goto('/pagescms/fixture/main/media/default')
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible({
    timeout: 30_000,
  })
  await page.waitForLoadState('networkidle')
  let write!: (route: Route) => void
  let read!: (value: { route: Route; response: APIResponse }) => void
  const heldWrite = new Promise<Route>((resolve) => {
    write = resolve
  })
  const heldRead = new Promise<{ route: Route; response: APIResponse }>(
    (resolve) => {
      read = resolve
    },
  )
  let interceptedWrite = false
  let interceptedRead = false
  await page.route('**/_serverFn/**', async (route) => {
    if (!interceptedWrite && route.request().method() === 'POST') {
      interceptedWrite = true
      write(route)
    } else if (
      !interceptedRead &&
      route.request().method() === 'GET' &&
      route.request().url().includes('Library')
    ) {
      interceptedRead = true
      read({ route, response: await route.fetch() })
    } else await route.continue()
  })
  const source = page.locator('[data-media-path="public/images/hero.svg"]')
  const destination = page.locator('[data-media-path="public/images/Library"]')
  const from = (await source.boundingBox())!
  const to = (await destination.boundingBox())!
  await source.hover()
  await page.mouse.down()
  await page.mouse.move(
    from.x + from.width / 2 + 12,
    from.y + from.height / 2,
    { steps: 2 },
  )
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  })
  await expect(destination).toHaveAttribute('data-drop-active', 'true')
  await page.mouse.up()
  const pendingWrite = await heldWrite
  // dnd-kit briefly suppresses clicks after dropping a pointer drag.
  await expect(async () => {
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    await expect(page).toHaveURL(/path=public%2Fimages%2FLibrary/, {
      timeout: 250,
    })
  }).toPass({ timeout: 5_000 })
  const pendingRead = await heldRead
  await pendingWrite.continue()
  await expect(page.getByText('File moved', { exact: true })).toBeVisible()
  await pendingRead.route.fulfill({ response: pendingRead.response })
  await expect(page.getByText('hero.svg', { exact: true })).toBeVisible()
  await expect(page.getByText('nested.svg', { exact: true })).toBeVisible()
  await page.unroute('**/_serverFn/**')
})
