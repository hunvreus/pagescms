import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { SearchInput } from '#/components/search-input'
import UserPlus from '@hugeicons/core-free-icons/UserPlusIcon'
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
import { RepositoryAdminPage } from './repository-admin-page'

export function CollaboratorsSkeleton() {
  const { t: _t } = useUiMessages()

  const searchControl = (
    <SearchInput
      disabled
      aria-label={_t({ message: 'Search collaborators' })}
      placeholder={_t({ message: 'Search collaborators…' })}
    />
  )

  return (
    <RepositoryAdminPage
      title={_t({ message: 'Collaborators' })}
      toolbar={searchControl}
      actions={
        <Button
          disabled
          aria-label={_t({ message: 'Invite collaborator' })}
          className="max-md:size-8 max-md:p-0 max-md:has-data-[icon=inline-start]:pl-0 max-md:has-data-[icon=inline-end]:pr-0"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={UserPlus}
            data-icon="inline-start"
          />
          <span className="hidden md:inline">
            <UiTrans>Invite collaborator</UiTrans>
          </span>
        </Button>
      }
    >
      <div className="-mt-4 md:hidden">{searchControl}</div>
      <CollaboratorsTableSkeleton />
    </RepositoryAdminPage>
  )
}

export function CollaboratorsTableSkeleton() {
  const { t: _t } = useUiMessages()

  return (
    <Table
      aria-label={_t({ message: 'Loading collaborators' })}
      aria-busy="true"
      containerClassName="rounded-xl border bg-card"
    >
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>
            <UiTrans>Collaborator</UiTrans>
          </TableHead>
          <TableHead>
            <UiTrans>Status</UiTrans>
          </TableHead>
          <TableHead className="w-px" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {[0, 1, 2].map((row) => (
          <TableRow key={row} className="hover:bg-transparent">
            <TableCell>
              <Skeleton className="h-4 w-40 max-w-full" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-5 w-20 rounded-full" />
            </TableCell>
            <TableCell className="py-0 text-right">
              <Skeleton className="ml-auto h-7 w-7" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
