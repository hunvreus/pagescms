import {
  contentI18n,
  isContentLocaleCode,
  localeDirectory,
  localizedPath,
  parseLocalizedPath,
} from '#/lib/i18n'
import { getGitRelativePath, joinGitPath } from '#/shared/git-path'
import { isRepositoryProviderError } from '../repository/provider'
import { createDirectoryCache } from '#/server/cache/directory'
import type { ContentSchema } from '#/shared/configuration-content'

type Input = Parameters<ReturnType<typeof createDirectoryCache>['get']>[0] & {
  repositoryId?: number
}
export async function localizedDirectory(
  database: Parameters<typeof createDirectoryCache>[0]['database'],
  input: Input,
  schema: ContentSchema,
  locale?: string,
): Promise<
  Awaited<ReturnType<ReturnType<typeof createDirectoryCache>['get']>>
> {
  const settings = contentI18n(schema)
  const selected = locale ?? settings?.default
  if (
    selected !== undefined &&
    (!isContentLocaleCode(selected) ||
      (settings && !settings.locales.some((item) => item.code === selected)))
  )
    throw new Error('Unknown content locale')
  const cache = createDirectoryCache({
    database,
    repositoryId: input.repositoryId,
  })
  if (settings?.scheme !== 'files') return cache.get(input)
  const canonical = input.path
  const physical = localeDirectory(schema, canonical, selected!)
  const read = async (path: string) => {
    try {
      return await cache.get({ ...input, path, nodeFilename: undefined })
    } catch (error) {
      if (!isRepositoryProviderError(error, 404)) throw error
      return { entries: [], revision: undefined }
    }
  }
  const parentMode =
    settings.path?.type === 'folder' && settings.path.position === 'parent'
  const [primary, secondary] = await Promise.all([
    read(physical),
    parentMode && physical !== canonical ? read(canonical) : null,
  ])
  const entries = [
    ...primary.entries.filter((entry) => !parentMode || entry.type !== 'dir'),
    ...(secondary?.entries.filter((entry) => entry.type === 'dir') ??
      (parentMode
        ? primary.entries.filter((entry) => entry.type === 'dir')
        : [])),
  ]
  const locales = new Set(settings.locales.map((item) => item.code))
  const localizedEntries = entries.flatMap((entry) => {
    if (entry.type === 'file') {
      const parsed = parseLocalizedPath(schema, entry.path)
      return parsed?.locale === selected ? [entry] : []
    }
    if (
      settings.path?.type === 'folder' &&
      (parentMode ||
        (settings.path.position === 'collection' &&
          canonical === schema.path &&
          selected === settings.default &&
          settings.path.default === 'omit')) &&
      locales.has(entry.name)
    )
      return []
    const relative = getGitRelativePath(
      entry.path,
      parentMode ? canonical : physical,
    )
    return [{ ...entry, path: joinGitPath(canonical, relative) }]
  })
  if (input.nodeFilename) {
    const paths = localizedEntries
      .filter((entry) => entry.type === 'dir')
      .map((entry) =>
        localizedPath(
          schema,
          joinGitPath(entry.path, input.nodeFilename!),
          selected!,
        ),
      )
    if (paths.length) {
      const nodes = await cache.getNodeFiles(input, primary.revision, paths)
      const known = new Set(localizedEntries.map((entry) => entry.path))
      localizedEntries.push(
        ...nodes.filter(
          (entry) => entry.type === 'file' && !known.has(entry.path),
        ),
      )
    }
  }
  return { ...primary, entries: localizedEntries }
}
