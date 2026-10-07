import { readFile, rm, writeFile } from 'node:fs/promises'

import { expect, test } from './test'

function metricsPath() {
  const value = process.env.PAGESCMS_E2E_GITHUB_METRICS_PATH
  if (!value) throw new Error('GitHub fixture metrics path is required')
  return value
}
const mediaDirectoryPath =
  '/repos/pagescms/performance-fixture/contents/public/images'
const productionBenchmark = process.env.PAGESCMS_E2E_PRODUCTION === 'true'

test.describe.configure({ mode: 'serial' })

type FixtureRequest = {
  method: string
  path: string
  search: string
}

test.afterEach(async () => {
  await rm(metricsPath(), { force: true })
})

async function fixtureRequests() {
  const source = await readFile(metricsPath(), 'utf8')
  return source
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FixtureRequest)
}

function percentile(values: Array<number>, percentage: number) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.ceil(sorted.length * percentage) - 1]
}

function summary(values: Array<number>) {
  return {
    p50: Math.round(percentile(values, 0.5)),
    p95: Math.round(percentile(values, 0.95)),
  }
}

test('loads a media manifest and its image sources from one GitHub directory request', async ({
  page,
}) => {
  await writeFile(metricsPath(), '')
  const coldStartedAt = performance.now()

  await page.goto(
    '/pagescms/performance-fixture/main/media/default?path=public%2Fimages',
  )
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

  await writeFile(metricsPath(), '')
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

test('measures production media first-useful-render for public and private repositories', async ({
  page,
}, testInfo) => {
  test.skip(!productionBenchmark, 'Run by the production media benchmark')
  test.setTimeout(120_000)

  const results: Record<
    string,
    {
      cold: ReturnType<typeof summary>
      warm: ReturnType<typeof summary>
      coldDirectoryRequests: number
      warmDirectoryRequests: number
    }
  > = {}

  for (const repository of [
    'performance-fixture',
    'private-performance-fixture',
  ]) {
    await writeFile(metricsPath(), '')
    const cold: Array<number> = []
    const warm: Array<number> = []
    let coldDirectoryRequests = 0
    let warmDirectoryRequests = 0
    const directoryRequests = async () =>
      (await fixtureRequests()).filter(
        (request) =>
          request.method === 'GET' &&
          request.path.startsWith(
            `/repos/pagescms/${repository}/contents/public/images/perf-`,
          ),
      ).length

    for (let sample = 0; sample < 20; sample += 1) {
      const path = `public/images/perf-${sample}`
      const beforeCold = await directoryRequests()
      const startedAt = performance.now()
      await page.goto(
        `/pagescms/${repository}/main/media/default?path=${encodeURIComponent(path)}`,
      )
      await expect(page.locator('[data-state="loaded"]')).toHaveCount(2, {
        timeout: 15_000,
      })
      cold.push(performance.now() - startedAt)
      const afterCold = await directoryRequests()
      coldDirectoryRequests += afterCold - beforeCold

      // Reload immediately while this directory's cache entry is fresh.
      // Twenty consecutive reloads of the last folder can exceed its TTL.
      const warmStartedAt = performance.now()
      await page.reload()
      await expect(page.locator('[data-state="loaded"]')).toHaveCount(2, {
        timeout: 15_000,
      })
      warm.push(performance.now() - warmStartedAt)
      warmDirectoryRequests += (await directoryRequests()) - afterCold
    }

    expect(coldDirectoryRequests).toBe(20)
    expect(warmDirectoryRequests).toBe(0)

    results[repository] = {
      cold: summary(cold),
      warm: summary(warm),
      coldDirectoryRequests,
      warmDirectoryRequests,
    }
  }

  await testInfo.attach('media-performance.json', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  })
  console.log(`MEDIA_PERFORMANCE ${JSON.stringify(results)}`)
})
