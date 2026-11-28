import type { RepositoryPageContribution } from '#/plugins/client'

// Reserve every core destination, including route prefixes with child pages.
export const CORE_REPOSITORY_PATHS = [
  'configuration',
  'collaborators',
  'actions',
  'cache',
  'collection',
  'file',
  'media',
  'extensions',
] as const

export function repositoryPagePath(
  key: string,
  page: RepositoryPageContribution,
) {
  return page.path ?? key.split('/')[1]
}

export function repositoryPageKey(
  pages: Readonly<Record<string, RepositoryPageContribution>>,
  path: string,
) {
  return Object.keys(pages).find(
    (key) => repositoryPagePath(key, pages[key]) === path,
  )
}
