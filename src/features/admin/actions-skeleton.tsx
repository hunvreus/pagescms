import {
  useLingui as useUiMessages,
  Trans as UiTrans,
} from '@lingui/react/macro'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import ChevronDown from '@hugeicons/core-free-icons/ChevronDownIcon'
import Play from '@hugeicons/core-free-icons/PlayIcon'
import ReloadIcon from '@hugeicons/core-free-icons/ReloadIcon'
import { SearchInput } from '#/components/search-input'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue } from '#/components/ui/select'
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '#/components/ui/table'
import { RepositoryAdminPage } from './repository-admin-page'

export function ActionsSkeleton() {
  const { t: remainingT } = useUiMessages()

  const { t: _t } = useUiMessages()

  const refresh = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              disabled
              size="icon"
              variant="outline"
              aria-label={_t({ message: 'Refresh action runs' })}
            >
              <HugeiconsIcon aria-hidden="true" icon={ReloadIcon} />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <UiTrans>Refresh</UiTrans>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  const toolbar = (
    <>
      <span className="hidden md:contents">{refresh}</span>
      <Select disabled value="all">
        <SelectTrigger
          aria-label={_t({ message: 'Filter runs by action' })}
          className="min-w-0 flex-1 md:w-48 md:flex-none"
        >
          <SelectValue>
            <UiTrans>All actions</UiTrans>
          </SelectValue>
        </SelectTrigger>
      </Select>
      <SearchInput
        groupClassName="min-w-0 flex-1 md:w-64 md:flex-none"
        disabled
        aria-label={_t({ message: 'Search action runs' })}
        placeholder={_t({ message: 'Search runs…' })}
      />
    </>
  )

  return (
    <RepositoryAdminPage
      title={_t({ message: 'Actions' })}
      toolbar={toolbar}
      actions={
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <span className="md:hidden">{refresh}</span>
          <Button
            disabled
            aria-label={_t({ message: 'Run' })}
            className="max-md:size-8 max-md:p-0 max-md:has-data-[icon=inline-start]:pl-0 max-md:has-data-[icon=inline-end]:pr-0"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={Play}
              data-icon="inline-start"
            />
            <span className="hidden md:inline">
              <UiTrans>Run</UiTrans>
            </span>
            <HugeiconsIcon
              aria-hidden="true"
              icon={ChevronDown}
              className="hidden md:block"
              data-icon="inline-end"
            />
          </Button>
        </div>
      }
    >
      <div className="-mt-4 flex items-center gap-2 md:hidden">{toolbar}</div>
      <Table
        aria-label={_t({ message: 'Loading actions' })}
        aria-busy="true"
        containerClassName="rounded-xl border bg-card"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {[
              remainingT({ message: 'Status' }),
              remainingT({ message: 'Action' }),
              remainingT({ message: 'Triggered by' }),
              remainingT({ message: 'Started' }),
            ].map((title) => (
              <TableHead key={title}>{title}</TableHead>
            ))}
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[0, 1, 2].map((row) => (
            <TableRow key={row} className="hover:bg-transparent">
              <TableCell>
                <Skeleton className="h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32 max-w-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell className="py-0 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-7 w-7" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </RepositoryAdminPage>
  )
}
