import { readFile, rm, writeFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

const metricsPath = (() => {
  const value = process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH
  if (!value) throw new Error('GitHub fixture metrics path is required')
  return value
})()
const mediaDirectoryPath = '/repos/pagescms/fixture/contents/public/images'

type FixtureRequest = {
  method: string
  path: string
  search: string
}

test.afterEach(async () => {
  await rm(metricsPath, { force: true })
})

async function fixtureRequests() {
  const source = await readFile(metricsPath, 'utf8')
  return source
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FixtureRequest)
}

test('loads a media manifest and its image sources from one GitHub directory request', async ({
  page,
}) => {
  await writeFile(metricsPath, '')
  const coldStartedAt = performance.now()

  await page.goto('/pagescms/fixture/main/media/default?path=public%2Fimages')
  await expect(page.locator('[data-state="loaded"]')).toHaveCount(2, {
    timeout: 15_000,
  })

  const requests = (await fixtureRequests()).filter(
    (request) =>
      request.method === 'GET' && request.path === mediaDirectoryPath,
  )
  test.info().annotations.push({
    type: 'cold measurement',
    description: `${requests.length} GitHub directory request; ${Math.round(performance.now() - coldStartedAt)} ms until two thumbnails loaded`,
  })
  expect(requests).toHaveLength(1)

  await writeFile(metricsPath, '')
  const warmStartedAt = performance.now()
  await page.reload()
  await expect(page.locator('[data-state="loaded"]')).toHaveCount(2, {
    timeout: 15_000,
  })
  const warmRequests = (await fixtureRequests()).filter(
    (request) =>
      request.method === 'GET' && request.path === mediaDirectoryPath,
  )
  test.info().annotations.push({
    type: 'warm measurement',
    description: `${warmRequests.length} GitHub directory requests; ${Math.round(performance.now() - warmStartedAt)} ms until two thumbnails loaded`,
  })
  expect(warmRequests).toHaveLength(0)
})
