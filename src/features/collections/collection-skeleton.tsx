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
  { id: 'image', width: '4rem', headerWidth: 'w-10' },
  { id: 'primary', width: undefined, headerWidth: 'w-20' },
  {
    id: 'description',
    width: 'clamp(12rem, 24vw, 24rem)',
    headerWidth: 'w-24',
  },
  { id: 'date', width: '10rem', headerWidth: 'w-12' },
  { id: 'boolean', width: '7rem', headerWidth: 'w-16' },
  { id: 'actions', width: '6rem', headerWidth: 'ml-auto w-14' },
] as const

export function CollectionSkeleton() {
  return (
    <div className="-mt-4 space-y-5 md:-mt-6" aria-label="Loading collection">
      <RepositoryPageHeader
        actions={
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
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
            <col key={column.id} style={{ width: column.width }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.id}>
                {column.id !== 'actions' ? (
                  <Skeleton className={`h-4 ${column.headerWidth}`} />
                ) : null}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }, (_, row) => (
            <TableRow key={row}>
              <TableCell className="py-0">
                <Skeleton className="size-8" />
              </TableCell>
              <TableCell>
                <Skeleton className={row % 3 === 0 ? 'h-4 w-52' : 'h-4 w-40'} />
              </TableCell>
              <TableCell>
                <Skeleton
                  className={row % 2 === 0 ? 'h-4 w-full' : 'h-4 w-3/4'}
                />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24 rounded-full" />
              </TableCell>
              <TableCell>
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
