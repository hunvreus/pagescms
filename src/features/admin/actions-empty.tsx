import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { ChevronDown, Play, RotateCcw } from 'lucide-react'
import { SearchInput } from '#/components/search-input'
import { Button } from '#/components/ui/button'
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

export function ActionsEmpty() {
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
        aria-label="Recent action runs"
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
          <TableRow>
            <TableCell
              colSpan={5}
              className="text-center text-muted-foreground"
            >
              No actions configured.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </RepositoryAdminPage>
  )
}
