import {
  getGitParentPath,
  getGitRelativePath,
  joinGitPath,
  normalizeGitPath,
} from '#/lib/git-path'

export interface EntryBreadcrumbGroup {
  name: string
  label: string
}

export type EntryBreadcrumbSegment =
  | { type: 'group'; label: string }
  | { type: 'root'; label: string }
  | { type: 'folder'; label: string; path: string }
  | {
      type: 'ellipsis'
      items: Array<{ label: string; path: string }>
    }
  | { type: 'current'; label: string }

export interface EntryBreadcrumbInput {
  currentLabel: string
  creationParent?: string
  entryPath?: string
  groupTrail?: readonly EntryBreadcrumbGroup[]
  rootPath?: string
  schemaLabel: string
  schemaType: string
}

export function buildEntryBreadcrumb({
  currentLabel,
  creationParent,
  entryPath,
  groupTrail = [],
  rootPath,
  schemaLabel,
  schemaType,
}: EntryBreadcrumbInput): EntryBreadcrumbSegment[] {
  const groups: EntryBreadcrumbSegment[] = groupTrail.map((group) => ({
    type: 'group',
    label: group.label || group.name,
  }))

  if (schemaType !== 'collection' || rootPath === undefined) {
    return [...groups, { type: 'current', label: currentLabel }]
  }

  const normalizedRoot = normalizeGitPath(rootPath)
  const parent = entryPath
    ? getGitParentPath(entryPath)
    : normalizeGitPath(creationParent ?? normalizedRoot)
  const relativeParent = getGitRelativePath(parent, normalizedRoot)
  const parts = relativeParent.split('/').filter(Boolean)
  const folders = parts.map((label, index) => ({
    label,
    path: joinGitPath(normalizedRoot, ...parts.slice(0, index + 1)),
  }))
  const immediateParent = folders.at(-1)
  const hiddenParents = folders.slice(0, -1)
  const segments: EntryBreadcrumbSegment[] = [
    ...groups,
    { type: 'root', label: schemaLabel },
  ]

  if (hiddenParents.length) {
    segments.push({ type: 'ellipsis', items: hiddenParents })
  }
  if (immediateParent) {
    segments.push({ type: 'folder', ...immediateParent })
  }
  segments.push({ type: 'current', label: currentLabel })
  return segments
}
