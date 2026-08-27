export type RepositoryPendingContent = 'collection' | 'generic'

export function repositoryPendingContent(
  pathname: string,
): RepositoryPendingContent {
  const segments = pathname.split('/').filter(Boolean)
  return segments.length === 5 && segments[3] === 'collection'
    ? 'collection'
    : 'generic'
}
