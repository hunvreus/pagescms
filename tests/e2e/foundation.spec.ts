import { expect, test } from '@playwright/test'

test('serves the foundation page and health contract', async ({
  page,
  request,
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Pages CMS', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('TanStack Start foundation')).toBeVisible()

  const health = await request.get('/api/health', {
    headers: { 'x-request-id': 'playwright-foundation' },
  })

  expect(health.ok()).toBe(true)
  expect(health.headers()['x-request-id']).toBe('playwright-foundation')
  await expect(health.json()).resolves.toEqual({
    service: 'pagescms',
    status: 'ok',
  })
})
