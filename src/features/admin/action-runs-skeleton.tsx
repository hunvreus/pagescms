import { Skeleton } from '#/components/ui/skeleton'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '#/components/ui/table'

export function ActionRunsSkeleton() {
  return (
    <div
      className="space-y-3"
      aria-label="Loading action runs"
      aria-busy="true"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          disabled
          aria-label="Search action runs"
          placeholder="Search runs…"
          className="sm:flex-1"
        />
        <Button
          disabled
          variant="outline"
          className="w-full justify-start sm:w-48"
        >
          All actions
        </Button>
      </div>
      <Table containerClassName="overflow-visible rounded-xl border bg-card">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Action</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Triggered by</TableHead>
            <TableHead>Started</TableHead>
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }, (_, index) => (
            <TableRow key={index} className="hover:bg-transparent">
              {Array.from({ length: 5 }, (_value, cell) => (
                <TableCell key={cell}>
                  <Skeleton className={cell === 4 ? 'size-7' : 'h-4 w-20'} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
