import { expect, it } from 'vitest'
import {
  repositoryPageKey,
  repositoryPagePath,
  CORE_REPOSITORY_PATHS,
} from './repository-page-path'
import { readdirSync } from 'node:fs'

it('keeps plugin identity independent of the public route', () => {
  const page = {
    path: 'storage',
    label: 'Cloud storage',
    load: async () => ({ default: () => null }),
  }
  expect(repositoryPagePath('media-s3/connections', page)).toBe('storage')
  expect(repositoryPageKey({ 'media-s3/connections': page }, 'storage')).toBe(
    'media-s3/connections',
  )
  expect(
    repositoryPageKey({ 'media-s3/connections': page }, 'connections'),
  ).toBeUndefined()
  expect(
    repositoryPageKey({ 'media-s3/connections': page }, 'unknown'),
  ).toBeUndefined()
})
it('reserves every core route prefix', () => {
  for (const file of readdirSync('src/routes')) {
    const prefix = /^github\.\$owner\.\$repo\.\$branch\.([a-z-]+)/.exec(
      file.replace(/\.tsx?$/, ''),
    )?.[1]
    if (prefix && prefix !== 'index')
      expect(CORE_REPOSITORY_PATHS).toContain(prefix)
  }
})
