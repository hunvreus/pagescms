import { useEffect, useMemo, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createExpandedRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Folder,
  LoaderCircle,
  Plus,
} from 'lucide-react'

import { Button } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import type { getCollection } from '#/functions/collection'
import { getReferenceOptions } from '#/functions/references'
import { cn } from '#/lib/utils'
import { queryKeys, queryTimes } from '#/queries/keys'

import { CollectionCell, collectionReferenceValues } from './collection-cell'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

function columnSize(
  id: string,
  model: CollectionViewModel,
  fluidColumn: string | undefined,
) {
  if (id === 'actions') return 'w-24 min-w-24 max-w-24'
  if (id === fluidColumn) return 'w-full min-w-48 max-w-px'

  const column = model.columns.find(({ path }) => path === id)
  if (column?.type === 'image') return 'w-16 min-w-16 max-w-16'
  if (column?.type === 'boolean') return 'w-28 min-w-28 max-w-28'
  if (column?.type === 'date' || column?.type === 'datetime') {
    return 'w-40 min-w-40 max-w-40'
  }
  return 'max-w-48'
}

export function CollectionTable({
  data,
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
}: {
  data: CollectionItem[]
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
}) {
  const fluidColumn = collectionFluidColumn(model)
  const referenceRequests = useMemo(() => {
    const entries = [
      ...data,
      ...Object.values(children).flatMap((items) => items ?? []),
    ]
    return model.columns.flatMap((column) => {
      const settings = referenceSettings(column)
      if (!settings) return []
      const values = [
        ...new Set(
          entries.flatMap((entry) =>
            entry.type === 'file'
              ? collectionReferenceValues(entryValue(entry, column.path))
              : [],
          ),
        ),
      ].sort()
      return batches(values, 100).map((selectedValues) => ({
        column: column.path,
        settings,
        selectedValues,
      }))
    })
  }, [children, data, model.columns])
  const referenceQueries = useQueries({
    queries: referenceRequests.map((request) => ({
      queryKey: [
        ...queryKeys.branch(repository),
        'references',
        request.settings.collection,
        request.settings.valueTemplate,
        request.settings.labelTemplate,
        request.selectedValues,
      ] as const,
      queryFn: () =>
        getReferenceOptions({
          data: {
            owner: repository.owner,
            repo: repository.repo,
            branch: repository.branch,
            collection: request.settings.collection,
            query: '',
            valueTemplate: request.settings.valueTemplate,
            labelTemplate: request.settings.labelTemplate,
            searchFields: request.settings.searchFields,
            selectedValues: request.selectedValues,
          },
        }),
      enabled: request.selectedValues.length > 0,
      staleTime: queryTimes.directory,
      gcTime: queryTimes.gc,
    })),
  })
  const referenceLabels = useMemo(() => {
    const labels = new Map<string, Map<string, string>>()
    referenceQueries.forEach((query, index) => {
      const request = referenceRequests[index]
      const columnLabels = labels.get(request.column) ?? new Map()
      for (const option of query.data ?? []) {
        columnLabels.set(option.value, option.label)
      }
      labels.set(request.column, columnLabels)
    })
    return labels
  }, [referenceQueries, referenceRequests])
  const columns = useMemo(() => {
    const valueColumns = model.columns.map((column, index) =>
      helper.accessor((entry) => entryValue(entry, column.path), {
        id: column.path,
        enableGlobalFilter: false,
        enableSorting: model.sortFields.includes(column.path),
        sortFn: 'alphanumeric',
        sortUndefined: model.foldersFirst ? 'first' : 'last',
        header: ({ column: tableColumn }) => {
          if (!tableColumn.getCanSort()) {
            return <span className="block truncate">{column.label}</span>
          }
          const sorted = tableColumn.getIsSorted()
          return (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{column.label}</span>
              {sorted === 'asc' ? (
                <ArrowUp className="size-4 shrink-0 text-muted-foreground" />
              ) : sorted === 'desc' ? (
                <ArrowDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ArrowDown aria-hidden className="size-4 shrink-0 opacity-0" />
              )}
            </span>
          )
        },
        cell: ({ row, getValue }) => {
          const entry = row.original
          const isPrimary = column.path === model.primary
          const isTreeControl = model.layout === 'tree' && index === 0
          const expandable = entry.type === 'dir' || entry.isNode
          const content =
            entry.type === 'dir' ? (
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <Folder className="size-4 text-muted-foreground" />
                <span className="truncate">{entry.name}</span>
              </span>
            ) : (
              <CollectionCell
                column={column}
                media={media}
                referenceLabels={referenceLabels.get(column.path)}
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
                    aria-label={`${row.getIsExpanded() ? 'Collapse' : 'Expand'} ${entry.name}`}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (row.getIsExpanded()) row.toggleExpanded(false)
                      else
                        void onExpand(entry).then(() =>
                          row.toggleExpanded(true),
                        )
                    }}
                  >
                    {loading.has(entry.path) ? (
                      <LoaderCircle className="animate-spin" />
                    ) : row.getIsExpanded() ? (
                      <ChevronDown />
                    ) : (
                      <ChevronRight />
                    )}
                  </Button>
                ) : (
                  <span className="size-8" />
                )
              ) : null}
              {entry.type === 'dir' && model.layout === 'list' ? (
                <Link
                  className="min-w-0"
                  params={repository}
                  search={{ path: entry.path }}
                  to="/$owner/$repo/$branch/collection/$name"
                >
                  {content}
                </Link>
              ) : entry.type === 'file' && isPrimary ? (
                <Link
                  className="block min-w-0 flex-1 truncate font-medium"
                  params={{ ...repository, _splat: entry.path }}
                  to="/$owner/$repo/$branch/collection/$name/entry/$"
                >
                  {content}
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
          header: 'Search',
          enableGlobalFilter: true,
          enableSorting: false,
        },
      ),
      helper.display({
        id: 'actions',
        header: 'Actions',
        enableGlobalFilter: false,
        enableSorting: false,
        cell: ({ row }) => {
          const entry = row.original
          const addable = canAddChild(entry)
          return (
            <div className="flex justify-end">
              {entry.type === 'file' ? (
                <ButtonGroup>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      params={{ ...repository, _splat: entry.path }}
                      to="/$owner/$repo/$branch/collection/$name/entry/$"
                    >
                      Edit
                    </Link>
                  </Button>
                  {canRename || canDelete || (canCreate && addable) ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={`Actions for ${entry.name}`}
                          size="icon-sm"
                          variant="outline"
                        >
                          <EllipsisVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canCreate && addable ? (
                          <DropdownMenuItem onSelect={() => onAddChild(entry)}>
                            Add child
                          </DropdownMenuItem>
                        ) : null}
                        {canRename ? (
                          <DropdownMenuItem onSelect={() => onRename(entry)}>
                            Rename
                          </DropdownMenuItem>
                        ) : null}
                        {canRename && canDelete ? (
                          <DropdownMenuSeparator />
                        ) : null}
                        {canDelete ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => onDelete(entry)}
                          >
                            Delete
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </ButtonGroup>
              ) : canCreate && addable ? (
                <Button
                  aria-label={`Add child to ${entry.name}`}
                  size="icon-sm"
                  type="button"
                  variant="outline"
                  onClick={() => onAddChild(entry)}
                >
                  <Plus />
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
    canRename,
    loading,
    media,
    model,
    onAddChild,
    onDelete,
    onExpand,
    onRename,
    repository,
    referenceLabels,
    fluidColumn,
  ])

  const table = useTable(
    {
      features,
      columns,
      data,
      getRowId: (entry) => entry.path,
      getSubRows: (entry) => children[entry.path],
      getRowCanExpand: (row) =>
        model.layout === 'tree' &&
        (row.original.type === 'dir' || row.original.isNode),
      getColumnCanGlobalFilter: (column) => column.id === '_search',
      globalFilterFn: 'includesString',
      enableSortingRemoval: false,
      paginateExpandedRows: false,
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
  const pageCount = table.getPageCount()
  const currentPage = table.state.pagination.pageIndex
  const pages = pageOptions(currentPage, pageCount)
  const previousSearch = useRef(search)

  useEffect(() => {
    if (previousSearch.current === search) return
    previousSearch.current = search
    table.setPageIndex(0)
  }, [search, table])

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow className="hover:bg-transparent" key={group.id}>
              {group.headers.map((header) => {
                const canSort = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                const toggleSorting = header.column.getToggleSortingHandler()

                return (
                  <TableHead
                    aria-sort={
                      sorted === 'asc'
                        ? 'ascending'
                        : sorted === 'desc'
                          ? 'descending'
                          : canSort
                            ? 'none'
                            : undefined
                    }
                    className={cn(
                      'overflow-hidden',
                      columnSize(header.column.id, model, fluidColumn),
                      header.column.id === 'actions' && 'text-right',
                      canSort && 'cursor-pointer select-none hover:bg-muted/50',
                    )}
                    key={header.id}
                    onClick={canSort ? toggleSorting : undefined}
                    onKeyDown={
                      canSort
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              toggleSorting?.(event)
                            }
                          }
                        : undefined
                    }
                    tabIndex={canSort ? 0 : undefined}
                  >
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    className={cn(
                      'overflow-hidden',
                      columnSize(cell.column.id, model, fluidColumn),
                      cell.column.id === 'actions' && 'text-right',
                    )}
                    key={cell.id}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                className="h-24 text-center"
                colSpan={table.getVisibleLeafColumns().length}
              >
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {pageCount > 1 ? (
        <Pagination className="justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationLink
                aria-disabled={!table.getCanPreviousPage()}
                aria-label="Go to previous page"
                className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                href="#"
                size="icon"
                onClick={(event) => {
                  event.preventDefault()
                  if (table.getCanPreviousPage()) table.previousPage()
                }}
              >
                <ChevronLeft />
              </PaginationLink>
            </PaginationItem>
            {pages.map((page, index) => (
              <PaginationItem key={page}>
                {index > 0 && page - pages[index - 1] > 1 ? (
                  <PaginationEllipsis />
                ) : null}
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
            ))}
            <PaginationItem>
              <PaginationLink
                aria-disabled={!table.getCanNextPage()}
                aria-label="Go to next page"
                className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
                href="#"
                size="icon"
                onClick={(event) => {
                  event.preventDefault()
                  if (table.getCanNextPage()) table.nextPage()
                }}
              >
                <ChevronRight />
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  )
}
