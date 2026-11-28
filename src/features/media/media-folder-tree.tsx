import { useQueries } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import ChevronRight from '@hugeicons/core-free-icons/ChevronRightIcon'
import Check from '@hugeicons/core-free-icons/CheckIcon'
import Folder from '@hugeicons/core-free-icons/Folder02Icon'
import { Fragment, useId, useRef, useState } from 'react'
import { mediaQueryOptions } from '#/client/queries/content'
import { LoadError } from '#/components/operation-error'
import { Spinner } from '#/components/ui/spinner'
import { getGitParentPath, isGitPathWithin } from '#/shared/git-path'
import { mediaEntries } from './media-model'
import type { MediaCoordinates } from './media-browser'
import type { KeyboardEvent } from 'react'

type FolderRow = { path: string; label: string; level: number }

export function MediaFolderTree({
  coordinates,
  rootPath,
  label,
  selected,
  onSelect,
}: {
  coordinates: MediaCoordinates
  rootPath: string
  label: string
  selected: string | null
  onSelect: (path: string | null) => void
}) {
  const { t } = useLingui()
  const tree = useRef<HTMLDivElement>(null)
  const id = useId()
  const [focus, setFocus] = useState(selected ?? rootPath)
  const [expanded, setExpanded] = useState(() => {
    const paths = new Set([rootPath])
    let path = selected ?? rootPath
    while (path !== rootPath && isGitPathWithin(rootPath, path)) {
      paths.add(path)
      path = getGitParentPath(path)
    }
    return paths
  })
  const paths = [...expanded]
  if (selected !== null && !expanded.has(selected)) paths.push(selected)
  const queries = useQueries({
    queries: paths.map((path) =>
      mediaQueryOptions({
        ...coordinates,
        path: path === rootPath ? undefined : path,
      }),
    ),
  })
  const contents = new Map(paths.map((path, i) => [path, queries[i]]))
  const rows: FolderRow[] = []
  function visit(row: FolderRow) {
    rows.push(row)
    if (!expanded.has(row.path)) return
    const entries = contents.get(row.path)?.data?.entries ?? []
    for (const folder of mediaEntries(
      entries.filter((entry) => entry.type === 'dir'),
      {},
    )) {
      visit({ path: folder.path, label: folder.name, level: row.level + 1 })
    }
  }
  visit({ path: rootPath, label, level: 1 })
  const index = Math.max(
    0,
    rows.findIndex((row) => row.path === focus),
  )
  function toggle(path: string) {
    const next = new Set(expanded)
    if (next.has(path)) {
      for (const child of next)
        if (isGitPathWithin(path, child)) next.delete(child)
      if (
        selected !== null &&
        selected !== path &&
        isGitPathWithin(path, selected)
      )
        onSelect(null)
    } else next.add(path)
    setExpanded(next)
  }
  function expandable(path: string) {
    const query = contents.get(path)
    return (
      !query?.isSuccess ||
      query.data.entries.some((entry) => entry.type === 'dir')
    )
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== tree.current) return
    const row = rows[index]
    let next = index
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(index + 1, rows.length - 1)
        break
      case 'ArrowUp':
        next = Math.max(index - 1, 0)
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = rows.length - 1
        break
      case 'ArrowRight':
        if (expandable(row.path) && !expanded.has(row.path)) toggle(row.path)
        else if (rows[index + 1]?.level > row.level) next++
        break
      case 'ArrowLeft':
        if (expanded.has(row.path) && expandable(row.path)) toggle(row.path)
        else if (row.level > 1)
          next = rows.findIndex((r) => r.path === getGitParentPath(row.path))
        break
      case 'Enter':
      case ' ':
        onSelect(row.path)
        break
      default:
        return
    }
    event.preventDefault()
    setFocus(rows[next].path)
    document.getElementById(id + next)?.scrollIntoView({ block: 'nearest' })
  }
  return (
    <div
      ref={tree}
      role="tree"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={id + index}
      className="group/tree max-h-[45dvh] overflow-y-auto rounded-md border p-1 outline-none"
      onKeyDown={navigate}
    >
      {rows.map((row, i) => {
        const query = contents.get(row.path)
        const open = expanded.has(row.path)
        const branch = expandable(row.path)
        return (
          <Fragment key={row.path}>
            <div
              id={id + i}
              role="treeitem"
              aria-label={row.label}
              aria-level={row.level}
              aria-expanded={branch ? open : undefined}
              aria-selected={selected === row.path}
              data-focused={i === index || undefined}
              className="flex min-h-8 cursor-pointer items-center gap-1 rounded-sm pr-2 text-sm hover:bg-muted aria-selected:bg-accent aria-selected:font-medium data-focused:group-focus-visible/tree:ring-1 data-focused:group-focus-visible/tree:ring-inset data-focused:group-focus-visible/tree:ring-ring"
              style={{ paddingInlineStart: 4 + (row.level - 1) * 16 }}
              onClick={() => {
                tree.current?.focus({ preventScroll: true })
                setFocus(row.path)
                onSelect(row.path)
              }}
            >
              <span
                aria-hidden="true"
                data-disclosure={branch || undefined}
                className="flex size-6 shrink-0 items-center justify-center rounded-sm data-disclosure:hover:bg-muted-foreground/15"
                onClick={
                  branch
                    ? (event) => {
                        event.stopPropagation()
                        tree.current?.focus({ preventScroll: true })
                        setFocus(row.path)
                        toggle(row.path)
                      }
                    : undefined
                }
              >
                {branch && (
                  <HugeiconsIcon
                    icon={ChevronRight}
                    className={open ? 'size-4 rotate-90' : 'size-4'}
                  />
                )}
              </span>
              <HugeiconsIcon
                aria-hidden="true"
                icon={Folder}
                className="size-4 shrink-0"
              />
              <span className="truncate">{row.label}</span>
              {query?.isFetching ? (
                <Spinner aria-hidden="true" className="ml-auto" />
              ) : (
                selected === row.path && (
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Check}
                    className="ml-auto size-4 shrink-0"
                  />
                )
              )}
            </div>
            {query?.isError && (
              <LoadError
                inline
                error={query.error}
                message={t({ message: 'Could not load media.' })}
                onRetry={() => void query.refetch()}
                retrying={query.isFetching}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
