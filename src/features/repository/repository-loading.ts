export type RepositoryPendingContent = 'overview' | 'collection' | 'generic'

export function repositoryPendingContent(
  pathname: string,
): RepositoryPendingContent {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'github') return 'generic'
  if (segments.length === 4) return 'overview'
  return segments.length === 6 && segments[4] === 'collection'
    ? 'collection'
    : 'generic'
}
