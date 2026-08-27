import { useEffect, useMemo, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
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

import { CollectionCell } from './collection-cell'
import { collectionValue, rowSearchValue } from './collection-model'

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
                repository={repository}
                value={getValue()}
              />
            )

          if (entry.type === 'dir' && !isTreeControl && index !== 0) return null

          return (
            <div
              className="flex min-w-0 items-center gap-1"
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
                  className="min-w-0 truncate font-medium"
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
      <Table className="table-fixed">
        <colgroup>
          {table.getVisibleLeafColumns().map((column) => {
            const modelColumn = model.columns.find(
              (candidate) => candidate.path === column.id,
            )
            const width =
              column.id === 'actions'
                ? '6rem'
                : column.id === model.primary
                  ? undefined
                  : modelColumn?.type === 'image'
                    ? '4rem'
                    : modelColumn?.type === 'boolean'
                      ? '7rem'
                      : modelColumn?.type === 'date' ||
                          modelColumn?.type === 'datetime'
                        ? '10rem'
                        : 'clamp(12rem, 24vw, 24rem)'
            return <col key={column.id} style={{ width }} />
          })}
        </colgroup>
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
                    className={
                      header.column.id === 'actions'
                        ? 'text-right'
                        : canSort
                          ? 'cursor-pointer overflow-hidden select-none hover:bg-muted/50'
                          : 'overflow-hidden'
                    }
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
                    className={
                      cell.column.id === 'actions'
                        ? 'text-right'
                        : 'overflow-hidden'
                    }
                    key={cell.id}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={model.columns.length + 1}>
                No entries found.
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
