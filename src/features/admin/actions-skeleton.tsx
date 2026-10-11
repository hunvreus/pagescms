import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { ChevronDown, Play, RotateCcw } from 'lucide-react'
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
  return (
    <RepositoryAdminPage
      title="Actions"
      actions={
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    disabled
                    size="icon"
                    variant="ghost"
                    aria-label="Refresh action runs"
                  >
                    <RotateCcw />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Select disabled value="all">
            <SelectTrigger
              aria-label="Filter runs by action"
              className="w-full sm:w-48"
            >
              <SelectValue>All actions</SelectValue>
            </SelectTrigger>
          </Select>
          <SearchInput
            disabled
            aria-label="Search action runs"
            placeholder="Search runs…"
          />
          <Button disabled>
            <Play />
            Run
            <ChevronDown />
          </Button>
        </div>
      }
    >
      <Table
        aria-label="Loading actions"
        aria-busy="true"
        containerClassName="rounded-xl border bg-card"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {['Status', 'Action', 'Triggered by', 'Started'].map((title) => (
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
              <TableCell>
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
