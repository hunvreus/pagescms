import {
  CollectionDataCell,
  CollectionDataRow,
  CollectionTableLayout,
} from './collection-table-layout'
import { isRecord } from '#/shared/json'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '#/components/ui/spinner'
import {
  optimisticRows,
  useContentJobs,
} from '#/features/content/content-mutations'
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  filterFn_includesString,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import type { Cell } from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import ArrowUpRight from '@hugeicons/core-free-icons/ArrowUpRight01Icon'
import ChevronDown from '@hugeicons/core-free-icons/ChevronDownIcon'
import EllipsisVertical from '@hugeicons/core-free-icons/EllipsisVerticalIcon'
import ChevronLeft from '@hugeicons/core-free-icons/ChevronLeftIcon'
import ChevronRight from '@hugeicons/core-free-icons/ChevronRightIcon'
import Folder from '@hugeicons/core-free-icons/Folder01Icon'
import Plus from '@hugeicons/core-free-icons/PlusIcon'

import { Button } from '#/components/ui/button'
import { useRepositoryGitHubLink } from '#/hooks/use-repository-github-link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '#/components/ui/pagination'
import {
  TableBody,
  TableCell,
  TableErrorRow,
  TableRow,
} from '#/components/ui/table'
import type { getCollection } from '#/client/api/collections'
import { selectedReferencesQueryOptions } from '#/client/queries/references'
import { authenticationQueryOptions } from '#/client/queries/session'
import { cn } from 'cn'
import { collectionQueryOptions } from '#/client/queries/content'

import {
  CollectionCell,
  CollectionReferenceLabels,
  collectionReferenceValues,
} from './collection-cell'
import {
  collectionFluidColumn,
  collectionValue,
  rowSearchValue,
} from './collection-model'

import type { CollectionViewModel } from './collection-model'

type CollectionData = Awaited<ReturnType<typeof getCollection>>
export type CollectionItem = CollectionData['contents'][number]
type FileItem = Extract<CollectionItem, { type: 'file' }>

interface RepositoryCoordinates {
  repoId?: string
  source?: string
  owner: string
  repo: string
  branch: string
  name: string
}

const features = tableFeatures({
  columnVisibilityFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

const helper = createColumnHelper<typeof features, CollectionItem>()

function referenceSettings(column: CollectionViewModel['columns'][number]) {
  if (column.type !== 'reference' || !isRecord(column.field.options)) return
  const options = column.field.options
  const collection =
    typeof options.collection === 'string' ? options.collection : ''
  if (!collection) return
  const search = typeof options.search === 'string' ? options.search : 'name'
  return {
    collection,
    valueTemplate: typeof options.value === 'string' ? options.value : '{path}',
    labelTemplate: typeof options.label === 'string' ? options.label : '{name}',
    searchFields: search
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  }
}

function batches<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  )
}

function entryValue(entry: CollectionItem, path: string) {
  if (entry.type === 'dir') return
  if (path === 'name') return entry.name
  return collectionValue(entry.fields, path)
}

function pageOptions(current: number, count: number) {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index)
  const values = new Set([0, count - 1, current - 1, current, current + 1])
  return [...values]
    .filter((value) => value >= 0 && value < count)
    .sort((left, right) => left - right)
}

export function CollectionTable({
  collection,
  locale,
  data,
  directory,
  model,
  repository,
  media,
  children,
  loading,
  canCreate,
  canRename,
  canDelete,
  canAddChild,
  onExpand,
  onAddChild,
  onRename,
  onDelete,
  search,
  onSearchChange,
  readError,
}: {
  collection: CollectionData['collection']
  locale?: string
  data: CollectionItem[]
  directory: string
  model: CollectionViewModel
  repository: RepositoryCoordinates
  media: CollectionData['media']
  children: Partial<Record<string, CollectionItem[]>>
  loading: ReadonlySet<string>
  canCreate: boolean
  canRename: boolean
  canDelete: boolean
  canAddChild: (entry: CollectionItem) => boolean
  onExpand: (entry: CollectionItem) => Promise<void>
  onAddChild: (entry: CollectionItem) => void
  onRename: (entry: FileItem) => void
  onDelete: (entry: FileItem) => void
  search: string
  onSearchChange: Dispatch<SetStateAction<string>>
  readError?: { message: string; onRetry: () => void; retrying: boolean }
}) {
  const { t: _t, i18n: tableI18n } = useUiMessages()
  const [failedEntry, setFailedEntry] = useState<CollectionItem | null>(null)

  const jobs = useContentJobs(repository)
  const pendingJobs = useMemo(
    () =>
      jobs
        .filter((entry) => entry.status === 'pending')
        .flatMap((entry) => (entry.job ? [entry.job] : [])),
    [jobs],
  )
  const pendingRows = useMemo(
    () =>
      new Map(
        pendingJobs.flatMap(
          (job) =>
            [
              [
                job.kind === 'create'
                  ? `__creating__/${job.id}`
                  : (job.coordinates.path ?? ''),
                job.kind,
              ],
              ...(job.destination ? [[job.destination, job.kind]] : []),
            ] as Array<[string, string]>,
        ),
      ),
    [pendingJobs],
  )
  const directories = useMemo(() => {
    const paths = Object.keys(children)
    if (!paths.length) return []
    const entries = new Map(
      [...data, ...Object.values(children).flatMap((rows) => rows ?? [])].map(
        (entry) => [entry.path, entry],
      ),
    )
    return paths.map((path) => {
      const entry = entries.get(path)
      return {
        path,
        directory: entry?.type === 'file' ? entry.parentPath : path,
      }
    })
  }, [children, data])
  const childContents = useQueries({
    queries: directories.map((child) =>
      collectionQueryOptions({
        ...repository,
        path: child.directory,
        locale,
      }),
    ),
    combine: (results) => results.map((result) => result.data?.contents),
  })
  const { displayData, displayChildren } = useMemo(() => {
    const roots = optimisticRows(
      data,
      pendingJobs,
      directory,
      model,
      collection,
    )
    const subRows = new Map<string, CollectionItem[]>()
    directories.forEach((child, index) => {
      subRows.set(
        child.path,
        optimisticRows(
          childContents[index] ?? children[child.path] ?? [],
          pendingJobs,
          child.directory,
          model,
          collection,
        ),
      )
    })
    // TanStack rebuilds its tree from the root data reference when fetched children change.
    return {
      displayData: subRows.size ? [...roots] : roots,
      displayChildren: subRows,
    }
  }, [
    data,
    pendingJobs,
    directory,
    model,
    collection,
    directories,
    childContents,
    children,
  ])
  const canViewGitHub = useRepositoryGitHubLink()
  const fluidColumn = collectionFluidColumn(model)
  const columns = useMemo(() => {
    const valueColumns = model.columns.map((column, index) =>
      helper.accessor((entry) => entryValue(entry, column.path), {
        id: column.path,
        enableGlobalFilter: false,
        enableSorting: model.sortFields.includes(column.path),
        sortFn: 'alphanumeric',
        sortUndefined: model.foldersFirst ? 'first' : 'last',
        cell: ({ row, getValue }) => {
          const entry = row.original
          const isPrimary = column.path === model.primary
          const isTreeControl = model.layout === 'tree' && index === 0
          const expandable = entry.type === 'dir' || entry.isNode
          const content =
            entry.type === 'dir' ? (
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Folder}
                  className="size-4"
                />
                <span className="truncate">{entry.name}</span>
              </span>
            ) : (
              <CollectionCell
                column={column}
                media={media}
                repository={repository}
                value={getValue()}
              />
            )

          if (entry.type === 'dir' && !isTreeControl && index !== 0) return null

          return (
            <div
              className={cn(
                'flex w-full min-w-0 items-center gap-1',
                column.path !== fluidColumn && 'max-w-48',
              )}
              style={
                isTreeControl
                  ? { paddingLeft: `${row.depth * 24}px` }
                  : undefined
              }
            >
              {isTreeControl ? (
                expandable ? (
                  <Button
                    aria-busy={loading.has(entry.path)}
                    aria-label={`${row.getIsExpanded() ? _t({ message: 'Collapse' }) : _t({ message: 'Expand' })} ${entry.name}`}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (row.getIsExpanded()) row.toggleExpanded(false)
                      else
                        void onExpand(entry)
                          .then(() => {
                            setFailedEntry(null)
                            row.toggleExpanded(true)
                          })
                          .catch(() => setFailedEntry(entry))
                    }}
                  >
                    {loading.has(entry.path) ? (
                      <Spinner aria-hidden="true" />
                    ) : row.getIsExpanded() ? (
                      <HugeiconsIcon aria-hidden="true" icon={ChevronDown} />
                    ) : (
                      <HugeiconsIcon aria-hidden="true" icon={ChevronRight} />
                    )}
                  </Button>
                ) : (
                  <span className="size-8" />
                )
              ) : null}
              {entry.type === 'dir' && model.layout === 'list' ? (
                <Link
                  className="min-w-0 hover:underline"
                  params={repository}
                  search={{ path: entry.path, locale }}
                  to="/github/$owner/$repo/$branch/collection/$name"
                >
                  {content}
                </Link>
              ) : entry.type === 'file' &&
                isPrimary &&
                pendingRows.get(entry.path) === 'create' ? (
                <span className="min-w-0 flex-1 truncate font-medium">
                  {content}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {
                      {
                        create: _t({ message: 'Creating…' }),
                        save: _t({ message: 'Saving…' }),
                        rename: _t({ message: 'Renaming…' }),
                      }[
                        pendingRows.get(entry.path) as
                          'create' | 'save' | 'rename'
                      ]
                    }
                  </span>
                </span>
              ) : entry.type === 'file' && isPrimary ? (
                <Link
                  className="block min-w-0 flex-1 truncate font-medium hover:underline"
                  params={{ ...repository, _splat: entry.path }}
                  to="/github/$owner/$repo/$branch/collection/$name/entry/$"
                  search={{ locale }}
                >
                  {content}
                  {pendingRows.has(entry.path) ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {pendingRows.get(entry.path) === 'save'
                        ? _t({ message: 'Saving…' })
                        : _t({ message: 'Renaming…' })}
                    </span>
                  ) : null}
                </Link>
              ) : (
                content
              )}
            </div>
          )
        },
      }),
    )

    return helper.columns([
      ...valueColumns,
      helper.accessor(
        (entry) =>
          entry.type === 'dir'
            ? entry.name
            : `${entry.name} ${entry.path} ${rowSearchValue(entry.fields, model.searchFields)}`,
        {
          id: '_search',
          header: _t({ message: 'Search' }),
          enableGlobalFilter: true,
          enableSorting: false,
        },
      ),
      helper.display({
        id: 'actions',
        header: '',
        enableGlobalFilter: false,
        enableSorting: false,
        cell: ({ row }) => {
          const entry = row.original
          const addable = canAddChild(entry)
          return (
            <div className="flex justify-end">
              {entry.type === 'file' ? (
                <div className="flex items-center gap-2">
                  {pendingRows.get(entry.path) === 'create' ? (
                    <Button disabled size="sm" type="button" variant="outline">
                      {collection.editable !== false ? (
                        <UiTrans>Edit</UiTrans>
                      ) : (
                        <UiTrans>View</UiTrans>
                      )}
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link
                        params={{ ...repository, _splat: entry.path }}
                        to="/github/$owner/$repo/$branch/collection/$name/entry/$"
                        search={{ locale }}
                      >
                        {collection.editable !== false ? (
                          <UiTrans>Edit</UiTrans>
                        ) : (
                          <UiTrans>View</UiTrans>
                        )}
                      </Link>
                    </Button>
                  )}
                  {canViewGitHub ||
                  canRename ||
                  canDelete ||
                  (canCreate && addable) ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={_t({
                            message: `Actions for ${entry.name}`,
                          })}
                          disabled={pendingRows.has(entry.path)}
                          size="icon-sm"
                          variant="outline"
                        >
                          <HugeiconsIcon
                            aria-hidden="true"
                            icon={EllipsisVertical}
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="w-max min-w-32 max-w-[calc(100vw-2rem)]"
                      >
                        {canViewGitHub ? (
                          <DropdownMenuItem asChild>
                            <a
                              href={`https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/blob/${encodeURIComponent(repository.branch)}/${entry.path.split('/').map(encodeURIComponent).join('/')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="whitespace-nowrap"
                            >
                              <UiTrans>View on GitHub</UiTrans>{' '}
                              <HugeiconsIcon
                                aria-hidden="true"
                                icon={ArrowUpRight}
                                className="ml-auto opacity-50"
                              />
                            </a>
                          </DropdownMenuItem>
                        ) : null}
                        {canViewGitHub &&
                        (canRename || canDelete || (canCreate && addable)) ? (
                          <DropdownMenuSeparator />
                        ) : null}
                        {canCreate && addable ? (
                          <DropdownMenuItem onSelect={() => onAddChild(entry)}>
                            <UiTrans>Add child</UiTrans>
                          </DropdownMenuItem>
                        ) : null}
                        {canRename ? (
                          <DropdownMenuItem onSelect={() => onRename(entry)}>
                            <UiTrans>Rename</UiTrans>
                          </DropdownMenuItem>
                        ) : null}
                        {canDelete ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => onDelete(entry)}
                          >
                            <UiTrans>Delete</UiTrans>
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              ) : canCreate && addable ? (
                <Button
                  aria-label={_t({ message: `Add child to ${entry.name}` })}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                  onClick={() => onAddChild(entry)}
                >
                  <HugeiconsIcon aria-hidden="true" icon={Plus} />
                </Button>
              ) : null}
            </div>
          )
        },
      }),
    ])
  }, [
    canCreate,
    canAddChild,
    canDelete,
    canViewGitHub,
    canRename,
    loading,
    media,
    model,
    onAddChild,
    onDelete,
    onExpand,
    onRename,
    repository,
    fluidColumn,
    pendingRows,
    locale,
    collection.editable,
    tableI18n,
  ])

  const table = useTable(
    {
      features,
      columns,
      data: displayData,
      getRowId: (entry) => entry.path,
      getSubRows: (entry) => displayChildren.get(entry.path),
      getRowCanExpand: (row) =>
        model.layout === 'tree' &&
        (row.original.type === 'dir' || row.original.isNode),
      getColumnCanGlobalFilter: (column) => column.id === '_search',
      globalFilterFn: 'includesString',
      enableSortingRemoval: false,
      paginateExpandedRows: false,
      autoResetExpanded: false,
      autoResetPageIndex: false,
      initialState: {
        sorting: model.initial.sorting,
        pagination: { pageIndex: 0, pageSize: 25 },
        columnVisibility: { _search: false },
      },
      state: { globalFilter: search },
      onGlobalFilterChange: onSearchChange,
    },
    (state) => ({
      globalFilter: state.globalFilter,
      sorting: state.sorting,
      pagination: state.pagination,
      expanded: state.expanded,
      columnVisibility: state.columnVisibility,
    }),
  )

  const rows = table.getRowModel().rows
  const referenceRequests = useMemo(() => {
    return model.columns.flatMap((column) => {
      const settings = referenceSettings(column)
      if (!settings) return []
      const values = new Set<string>()
      for (const { original: entry } of rows) {
        const [first] = collectionReferenceValues(
          entryValue(entry, column.path),
        )
        if (first) values.add(first)
      }
      return batches([...values].sort(), 100).map((selectedValues) => ({
        column: column.path,
        settings,
        selectedValues,
      }))
    })
  }, [rows, model.columns])
  const { data: auth } = useQuery(authenticationQueryOptions())
  const referenceBatches = useQueries({
    queries: referenceRequests.map((request) =>
      selectedReferencesQueryOptions(
        {
          ...repository,
          ...request.settings,
          selectedValues: request.selectedValues,
        },
        auth?.user?.id,
      ),
    ),
    combine: (results) =>
      results.map((query, index) => ({
        column: referenceRequests[index].column,
        options: query.data,
      })),
  })
  const referenceLabels = useMemo(() => {
    const labels = new Map<string, Map<string, string>>()
    for (const { column, options } of referenceBatches) {
      const columnLabels = labels.get(column) ?? new Map()
      for (const option of options ?? []) {
        columnLabels.set(option.value, option.label)
      }
      labels.set(column, columnLabels)
    }
    return labels
  }, [referenceBatches])
  const pageCount = table.getPageCount()
  const currentPage = table.state.pagination.pageIndex
  const pages = pageOptions(currentPage, pageCount)
  const previousSearch = useRef(search)

  useEffect(() => {
    if (previousSearch.current !== search) {
      previousSearch.current = search
      if (currentPage !== 0) table.setPageIndex(0)
    } else if (currentPage >= pageCount && currentPage > 0) {
      table.setPageIndex(Math.max(0, pageCount - 1))
    }
  }, [search, table, currentPage, pageCount])

  return (
    <div className="space-y-4">
      <CollectionTableLayout
        model={model}
        sorting={table.state.sorting}
        onSort={(id, event) =>
          table.getColumn(id)?.getToggleSortingHandler()?.(event)
        }
      >
        <CollectionReferenceLabels value={referenceLabels}>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <CollectionTableRow
                  key={row.id}
                  cells={row.getVisibleCells()}
                  expanded={
                    row.getCanExpand() ? row.getIsExpanded() : undefined
                  }
                  model={model}
                />
              ))
            ) : !readError && !failedEntry ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={table.getVisibleLeafColumns().length}
                >
                  <UiTrans>No results.</UiTrans>
                </TableCell>
              </TableRow>
            ) : null}
            {readError ? (
              <TableErrorRow
                colSpan={table.getVisibleLeafColumns().length}
                {...readError}
              />
            ) : null}
            {failedEntry ? (
              <TableErrorRow
                colSpan={table.getVisibleLeafColumns().length}
                message={_t({
                  message: `Could not load entries for ${failedEntry.name}.`,
                })}
                retrying={loading.has(failedEntry.path)}
                onRetry={() => {
                  void onExpand(failedEntry)
                    .then(() => {
                      table
                        .getRowModel()
                        .rows.find((row) => row.id === failedEntry.path)
                        ?.toggleExpanded(true)
                      setFailedEntry(null)
                    })
                    .catch(() => {})
                }}
              />
            ) : null}
          </TableBody>
        </CollectionReferenceLabels>
      </CollectionTableLayout>

      {pageCount > 1 ? (
        <Pagination className="justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationLink
                aria-disabled={!table.getCanPreviousPage()}
                aria-label={_t({ message: 'Go to previous page' })}
                className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                href="#"
                size="icon"
                onClick={(event) => {
                  event.preventDefault()
                  if (table.getCanPreviousPage()) table.previousPage()
                }}
              >
                <HugeiconsIcon aria-hidden="true" icon={ChevronLeft} />
              </PaginationLink>
            </PaginationItem>
            {pages.map((page, index) => (
              <Fragment key={page}>
                {index > 0 && page - pages[index - 1] > 1 ? (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : null}
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    isActive={page === currentPage}
                    onClick={(event) => {
                      event.preventDefault()
                      table.setPageIndex(page)
                    }}
                  >
                    {page + 1}
                  </PaginationLink>
                </PaginationItem>
              </Fragment>
            ))}
            <PaginationItem>
              <PaginationLink
                aria-disabled={!table.getCanNextPage()}
                aria-label={_t({ message: 'Go to next page' })}
                className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                href="#"
                size="icon"
                onClick={(event) => {
                  event.preventDefault()
                  if (table.getCanNextPage()) table.nextPage()
                }}
              >
                <HugeiconsIcon aria-hidden="true" icon={ChevronRight} />
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  )
}

const CollectionTableRow = memo(function CollectionRow({
  cells,
  expanded,
  model,
}: {
  cells: Cell<typeof features, CollectionItem, unknown>[]
  expanded?: boolean
  model: CollectionViewModel
}) {
  return (
    <CollectionDataRow layout={model.layout} aria-expanded={expanded}>
      {cells.map((cell) => (
        <CollectionDataCell
          type={
            cell.column.id === 'actions'
              ? 'actions'
              : model.columns.find((column) => column.path === cell.column.id)
                  ?.type
          }
          key={cell.id}
        >
          {/* Keep open menus mounted when a change of permissions or actions rebuilds the columns. */}
          {cell.column.id === 'actions' &&
          typeof cell.column.columnDef.cell === 'function' ? (
            cell.column.columnDef.cell(cell.getContext())
          ) : (
            <FlexRender cell={cell} />
          )}
        </CollectionDataCell>
      ))}
    </CollectionDataRow>
  )
})
