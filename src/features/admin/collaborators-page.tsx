import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { LoaderCircle, UserPlus } from 'lucide-react'

import { OperationError } from '#/components/operation-error'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '#/components/ui/field'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import {
  hasRepositoryCollaborators,
  RepositoryPermissionsContribution,
} from '#/features/collaborators/repository-permissions-contribution'
import { addCollaborators, deleteCollaborator } from '#/functions/collaborators'
import { collaboratorsQueryOptions } from '#/queries/repository'

import { RepositoryAdminPage } from './repository-admin-page'

function BasicCollaboratorsPage({
  owner,
  repo,
  branch,
  embedded = false,
}: {
  owner: string
  repo: string
  branch: string
  embedded?: boolean
}) {
  const params = { owner, repo, branch }
  const { data: collaborators } = useSuspenseQuery(
    collaboratorsQueryOptions(params),
  )
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [emails, setEmails] = useState('')
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<
    (typeof collaborators)[number] | null
  >(null)
  const [error, setError] = useState<unknown>(null)

  async function invite() {
    const values = [
      ...new Set(
        emails
          .split(/[\n,]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ]
    if (!values.length) return
    setInviting(true)
    setError(null)
    try {
      await addCollaborators({ data: { ...params, emails: values } })
      setEmails('')
      setInviteOpen(false)
      await queryClient.invalidateQueries({
        queryKey: collaboratorsQueryOptions(params).queryKey,
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setInviting(false)
    }
  }

  async function remove() {
    if (!removing) return
    const collaborator = removing
    setError(null)
    try {
      await deleteCollaborator({ data: { ...params, id: collaborator.id } })
      setRemoving(null)
      await queryClient.invalidateQueries({
        queryKey: collaboratorsQueryOptions(params).queryKey,
      })
    } catch (cause) {
      setError(cause)
    }
  }

  return (
    <RepositoryAdminPage
      embedded={embedded}
      title="Collaborators"
      actions={
        <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
          <UserPlus />
          Invite collaborator
        </Button>
      }
    >
      <OperationError
        error={error}
        fallback="Could not update collaborators."
      />
      <Table
        aria-label="Repository collaborators"
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
          {collaborators.length ? (
            collaborators.map((collaborator) => (
              <TableRow key={collaborator.id}>
                <TableCell className="font-medium">
                  {collaborator.email}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {collaborator.userId ? 'Active' : 'Invitation pending'}
                  </Badge>
                </TableCell>
                <TableCell>{collaborator.branch ?? 'All branches'}</TableCell>
                <TableCell className="py-0 text-right">
                  <Button
                    aria-label={`Remove ${collaborator.email}`}
                    size="sm"
                    variant="destructive"
                    onClick={() => setRemoving(collaborator)}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell
                className="text-center text-muted-foreground"
                colSpan={4}
              >
                No collaborators yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite collaborators</DialogTitle>
            <DialogDescription>
              Invite one or more people to edit this repository.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void invite()
            }}
          >
            <Field>
              <FieldLabel htmlFor="collaborator-emails">
                Email addresses
              </FieldLabel>
              <Textarea
                id="collaborator-emails"
                placeholder="alice@example.com, bob@example.com"
                rows={5}
                value={emails}
                onChange={(event) => setEmails(event.target.value)}
              />
              <FieldDescription>
                Separate addresses with commas or new lines. Invitations expire
                after 24 hours.
              </FieldDescription>
            </Field>
            <DialogFooter>
              <Button disabled={inviting || !emails.trim()} type="submit">
                {inviting ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <UserPlus />
                )}
                {inviting ? 'Inviting' : 'Send invitations'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove collaborator?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.email} will lose access to this repository.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void remove()}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RepositoryAdminPage>
  )
}

export function CollaboratorsPage(props: {
  owner: string
  repo: string
  branch: string
  embedded?: boolean
}) {
  if (hasRepositoryCollaborators) {
    return (
      <RepositoryAdminPage embedded={props.embedded} title="Collaborators">
        <RepositoryPermissionsContribution {...props} />
      </RepositoryAdminPage>
    )
  }
  return <BasicCollaboratorsPage {...props} />
}
