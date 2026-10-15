import { FolderPlus, Plus, Search } from 'lucide-react'

import { RepositoryPageHeader } from '#/components/repository-page-header'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'

const columns = [
  {
    id: 'image',
    width: '4rem',
    headerWidth: 'w-8',
    visibility: 'hidden @[24rem]/collection-loading:table-cell',
    columnVisibility: 'hidden @[24rem]/collection-loading:table-column',
  },
  {
    id: 'primary',
    width: undefined,
    headerWidth: 'w-20',
    visibility: '',
    columnVisibility: '',
  },
  {
    id: 'description',
    width: '14rem',
    headerWidth: 'w-24',
    visibility: 'hidden @[48rem]/collection-loading:table-cell',
    columnVisibility: 'hidden @[48rem]/collection-loading:table-column',
  },
  {
    id: 'date',
    width: '8rem',
    headerWidth: 'w-12',
    visibility: 'hidden @[32rem]/collection-loading:table-cell',
    columnVisibility: 'hidden @[32rem]/collection-loading:table-column',
  },
  {
    id: 'boolean',
    width: '6rem',
    headerWidth: 'w-16',
    visibility: 'hidden @[56rem]/collection-loading:table-cell',
    columnVisibility: 'hidden @[56rem]/collection-loading:table-column',
  },
  {
    id: 'actions',
    width: '8rem',
    headerWidth: 'ml-auto w-14',
    visibility: '',
    columnVisibility: '',
  },
] as const

export function CollectionSkeleton() {
  return (
    <div
      className="@container/collection-loading -mt-4 space-y-5 md:-mt-6"
      aria-label="Loading collection"
    >
      <RepositoryPageHeader
        actions={
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search collection"
                className="pl-9"
                disabled
                placeholder="Search entries…"
              />
            </label>
            <Button
              aria-label="New folder"
              disabled
              size="icon"
              variant="outline"
            >
              <FolderPlus />
            </Button>
            <Button disabled>
              <Plus /> New entry
            </Button>
          </div>
        }
        className="-mx-4 md:-mx-6"
      >
        <Skeleton className="h-6 w-32" />
      </RepositoryPageHeader>
      <Table
        className="table-fixed"
        containerClassName="rounded-xl border bg-card"
      >
        <colgroup>
          {columns.map((column) => (
            <col
              key={column.id}
              className={column.columnVisibility}
              style={{ width: column.width }}
            />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.id} className={column.visibility}>
                {column.id !== 'actions' ? (
                  <Skeleton
                    className={`h-4 max-w-full ${column.headerWidth}`}
                  />
                ) : null}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }, (_, row) => (
            <TableRow key={row} className="hover:bg-transparent">
              <TableCell className={`py-0 ${columns[0].visibility}`}>
                <Skeleton className="size-8" />
              </TableCell>
              <TableCell className={columns[1].visibility}>
                <Skeleton
                  className={
                    row % 3 === 0
                      ? 'h-4 w-52 max-w-full'
                      : 'h-4 w-40 max-w-full'
                  }
                />
              </TableCell>
              <TableCell className={columns[2].visibility}>
                <Skeleton
                  className={row % 2 === 0 ? 'h-4 w-full' : 'h-4 w-3/4'}
                />
              </TableCell>
              <TableCell className={columns[3].visibility}>
                <Skeleton className="h-5 w-24 max-w-full rounded-full" />
              </TableCell>
              <TableCell className={columns[4].visibility}>
                <Skeleton className="h-5 w-10 rounded-full" />
              </TableCell>
              <TableCell className="py-0 text-right">
                <Skeleton className="ml-auto h-7 w-16" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
