import { UserPlus } from 'lucide-react'
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
  return (
    <RepositoryAdminPage
      embedded
      title="Collaborators"
      actions={
        <Button size="sm" variant="outline" disabled>
          <UserPlus />
          Invite collaborator
        </Button>
      }
    >
      <Table
        aria-label="Loading collaborators"
        aria-busy="true"
        containerClassName="rounded-xl border bg-card"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Access</TableHead>
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
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell className="py-0 text-right">
                <Skeleton className="ml-auto h-7 w-16" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </RepositoryAdminPage>
  )
}
