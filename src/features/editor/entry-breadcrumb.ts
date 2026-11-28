import {
  getGitParentPath,
  getGitRelativePath,
  joinGitPath,
  normalizeGitPath,
} from '#/shared/git-path'

export interface EntryBreadcrumbGroup {
  name: string
  label: string
}

export type EntryBreadcrumbSegment =
  | { type: 'group'; label: string }
  | { type: 'root'; label: string }
  | { type: 'folder'; label: string; path: string }
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
    type: 'folder' as const,
    label,
    path: joinGitPath(normalizedRoot, ...parts.slice(0, index + 1)),
  }))
  return [
    ...groups,
    { type: 'root', label: schemaLabel },
    ...folders,
    { type: 'current', label: currentLabel },
  ]
}
