import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/operations/use-operation'
import { CollaboratorInviteInput } from '#/components/collaborator-invite-input'
import { parseCollaboratorEmails } from '#/lib/collaborator-invites'
import { toast } from 'sonner'
import { SearchInput } from '#/components/search-input'
import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'

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
import { CollaboratorStatus } from '#/features/collaborators/collaborator-status'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
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
}: {
  owner: string
  repo: string
  branch: string
}) {
  const params = { owner, repo, branch }
  const { data: collaborators } = useSuspenseQuery(
    collaboratorsQueryOptions(params),
  )
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const visibleCollaborators = collaborators.filter((collaborator) =>
    [
      collaborator.name,
      collaborator.email,
      collaborator.userId ? 'Active' : 'Invitation pending',
    ]
      .join(' ')
      .toLowerCase()
      .includes(query),
  )
  const [inviteOpen, setInviteOpen] = useState(false)
  const [emails, setEmails] = useState('')
  const invitation = useOperation<Awaited<ReturnType<typeof addCollaborators>>>(
    operationKey('collaborator-invite', { owner, repo }),
  )
  const removal = useOperation<Awaited<ReturnType<typeof deleteCollaborator>>>(
    operationKey('collaborator-remove', { owner, repo }),
  )
  const inviting = invitation.pending
  const [removing, setRemoving] = useState<
    (typeof collaborators)[number] | null
  >(null)
  const [error, setError] = useState<unknown>(null)

  async function invite() {
    if (invitation.pending) return
    setError(null)
    try {
      parseCollaboratorEmails(emails)
      const submittedEmails = emails
      await invitation.run({
        failureMessage: 'Could not invite collaborators.',
        run: () =>
          addCollaborators({ data: { ...params, emails: submittedEmails } }),
        confirmed: (added, active) => {
          if (!active()) return
          queryClient.setQueryData(
            collaboratorsQueryOptions(params).queryKey,
            (previous) =>
              previous
                ? [
                    ...previous.filter(
                      (person) => !added.some((item) => item.id === person.id),
                    ),
                    ...added,
                  ]
                : previous,
          )
          const invited = added.filter((person) => !person.userId).length
          toast.success(
            invited === added.length
              ? added.length === 1
                ? 'Invitation sent'
                : `${added.length} invitations sent`
              : added.length === 1
                ? 'Collaborator added'
                : `${added.length} collaborators added`,
          )
          refreshQueries(queryClient, [
            collaboratorsQueryOptions(params).queryKey,
          ])
        },
      })
      setEmails('')
      setInviteOpen(false)
    } catch (cause) {
      setError(cause)
    }
  }

  async function remove() {
    if (!removing || removal.pending) return
    const collaborator = removing
    setError(null)
    try {
      await removal.run({
        failureMessage: 'Could not remove collaborator.',
        run: () =>
          deleteCollaborator({ data: { ...params, id: collaborator.id } }),
        confirmed: (_result, active) => {
          if (!active()) return
          queryClient.setQueryData(
            collaboratorsQueryOptions(params).queryKey,
            (previous) =>
              previous?.filter((person) => person.id !== collaborator.id),
          )
          toast.success('Collaborator removed')
          refreshQueries(queryClient, [
            collaboratorsQueryOptions(params).queryKey,
          ])
        },
      })
      setRemoving(null)
    } catch (cause) {
      setError(cause)
    }
  }

  return (
    <RepositoryAdminPage
      title="Collaborators"
      actions={
        <>
          <SearchInput
            aria-label="Search collaborators"
            placeholder="Search collaborators…"

            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            onClick={() => {
              setError(null)
              setInviteOpen(true)
            }}
          >
            <UserPlus />
            Invite collaborator
          </Button>
        </>
      }
    >
      <OperationError
        error={inviteOpen ? null : (error ?? invitation.error ?? removal.error)}
        fallback="Could not update collaborators."
      />
      <Table
        aria-label="Repository collaborators"
        containerClassName="rounded-xl border bg-card"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Collaborator</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleCollaborators.length ? (
            visibleCollaborators.map((collaborator) => (
              <TableRow key={collaborator.id}>
                <TableCell className="font-medium">
                  {collaborator.name ? <div>{collaborator.name}</div> : null}
                  <div
                    className={
                      collaborator.name
                        ? 'text-sm font-normal text-muted-foreground'
                        : undefined
                    }
                  >
                    {collaborator.email}
                  </div>
                </TableCell>
                <TableCell>
                  <CollaboratorStatus active={Boolean(collaborator.userId)} />
                </TableCell>
                <TableCell className="py-0 text-right">
                  <Button
                    aria-label={`Remove ${collaborator.email}`}
                    size="sm"
                    variant="destructive"
                    disabled={removal.pending}
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
                colSpan={3}
              >
                {query ? 'No matching collaborators.' : 'No collaborators yet.'}
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
            <OperationError
              error={error ?? invitation.error}
              fallback="Could not invite collaborators."
            />
            <CollaboratorInviteInput
              value={emails}
              onChange={setEmails}
              disabled={inviting}
            />
            <p className="text-sm text-muted-foreground">
              Invitations expire after 24 hours.
            </p>
            <DialogFooter>
              <Button disabled={inviting || !emails.trim()} type="submit">
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
              disabled={removal.pending}
              onClick={(event) => {
                event.preventDefault()
                void remove()
              }}
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
}) {
  if (hasRepositoryCollaborators) {
    return (
      <RepositoryAdminPage title="Collaborators">
        <RepositoryPermissionsContribution {...props} />
      </RepositoryAdminPage>
    )
  }
  return <BasicCollaboratorsPage {...props} />
}
