import { useLingui } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import Plus from '@hugeicons/core-free-icons/PlusIcon'
import { RepositoryPageHeader } from '#/components/repository-page-header'
import { SearchInput } from '#/components/search-input'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'

export function CollectionSkeleton() {
  const { t } = useLingui()
  return (
    <div
      className="-mt-4 space-y-4 md:-mt-6 md:space-y-6"
      aria-busy="true"
      aria-label={t({ message: 'Loading collection' })}
    >
      <RepositoryPageHeader
        stackToolbar
        className="-mx-4 md:-mx-6"
        toolbar={
          <SearchInput
            groupClassName="w-full"
            aria-label={t({ message: 'Search collection' })}
            placeholder={t({ message: 'Search entries…' })}
            disabled
          />
        }
        actions={
          <Button
            disabled
            aria-label={t({ message: 'New entry' })}
            className="max-md:size-8 max-md:p-0 max-md:has-data-[icon=inline-start]:pl-0 max-md:has-data-[icon=inline-end]:pr-0"
          >
            <HugeiconsIcon
              icon={Plus}
              aria-hidden="true"
              data-icon="inline-start"
            />
            <span className="hidden md:inline">
              {t({ message: 'New entry' })}
            </span>
          </Button>
        }
      >
        <Skeleton className="h-7 w-32" />
      </RepositoryPageHeader>
      <Table
        className="table-fixed"
        containerClassName="rounded-xl border bg-card"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>
              <Skeleton className="h-4 w-24" />
            </TableHead>
            <TableHead className="w-32">
              <Skeleton className="h-4 w-16" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <TableRow
              key={index}
              className="h-[calc(2.75rem+1px)] hover:bg-transparent"
            >
              <TableCell>
                <Skeleton className="h-4 w-24 max-w-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-16 max-w-full" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
