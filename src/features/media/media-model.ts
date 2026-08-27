import type { getMedia } from '#/functions/media'

export type MediaDirectoryData = Awaited<ReturnType<typeof getMedia>>
export type MediaEntry = MediaDirectoryData['entries'][number]
export type MediaSort = 'name-asc' | 'name-desc' | 'size-asc' | 'size-desc'
export type MediaView = 'grid' | 'list'

export function mediaEntries(
  entries: MediaEntry[],
  {
    search = '',
    sort = 'name-asc',
    extensions,
  }: {
    search?: string
    sort?: MediaSort
    extensions?: string[]
  } = {},
) {
  const query = search.trim().toLocaleLowerCase()
  const allowed = extensions?.map((value) => value.toLocaleLowerCase())
  return entries
    .filter((entry) => {
      if (query && !entry.name.toLocaleLowerCase().includes(query)) return false
      if (entry.type === 'dir' || !allowed?.length) return true
      return allowed.includes(entry.name.split('.').at(-1)?.toLowerCase() ?? '')
    })
    .sort((left, right) => {
      if (left.type !== right.type) return left.type === 'dir' ? -1 : 1
      const direction = sort.endsWith('desc') ? -1 : 1
      if (sort.startsWith('size')) {
        const difference = (left.size ?? 0) - (right.size ?? 0)
        if (difference) return difference * direction
      }
      return (
        left.name.localeCompare(right.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        }) * direction
      )
    })
}

export function parentMediaPath(path: string, rootPath: string) {
  if (path === rootPath) return rootPath
  const parent = path.split('/').slice(0, -1).join('/')
  return parent === rootPath || parent.startsWith(`${rootPath}/`)
    ? parent
    : rootPath
}

export function formatMediaSize(value: number | null) {
  if (value === null) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function isImageMedia(path: string) {
  return /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(path)
}
