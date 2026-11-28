import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { Spinner } from '#/components/ui/spinner'
import { repositoryRequest } from '#/lib/repository-identity'
import {
  operationKey,
  refreshQueries,
  useOperation,
} from '#/features/pending-writes/use-operation'
import { CollaboratorInviteInput } from '#/components/collaborator-invite-input'
import { CollaboratorIdentity } from '#/components/collaborator-identity'
import {
  collaboratorInviteFieldError,
  parseCollaboratorEmails,
} from '#/lib/collaborator-invites'
import { SearchInput } from '#/components/search-input'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import UserPlus from '@hugeicons/core-free-icons/UserPlusIcon'
import Trash2 from '@hugeicons/core-free-icons/Delete02Icon'

import { authenticationQueryOptions } from '#/client/queries/session'
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
import { collaboratorStatus } from '#/lib/collaborator-status'
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
  TableErrorRow,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  hasRepositoryCollaborators,
  RepositoryCollaboratorsContribution,
} from '#/features/collaborators/collaborators-contribution'
import {
  addCollaborators,
  deleteCollaborator,
} from '#/client/api/collaborators'
import { collaboratorsQueryOptions } from '#/client/queries/repository'

import { RepositoryAdminPage } from './repository-admin-page'

function BasicCollaboratorsPage({
  owner,
  repo,
  branch,
  repoId,
}: {
  owner: string
  repo: string
  branch: string
  repoId?: string
}) {
  const { t: _t } = useUiMessages()

  const params = { owner, repo, branch, repoId }
  const {
    data: collaborators,
    error: readError,
    refetch,
    isFetching,
  } = useSuspenseQuery(collaboratorsQueryOptions(params))
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const visibleCollaborators = collaborators.filter((collaborator) =>
    [
      collaborator.name,
      collaborator.email,
      collaboratorStatus(
        Boolean(collaborator.userId),
        collaborator.inviteExpiresAt,
      ),
    ]
      .join(' ')
      .toLowerCase()
      .includes(query),
  )
  const [inviteOpen, setInviteOpen] = useState(false)
  const inviteVisible = useRef(false)
  useEffect(
    () => () => {
      inviteVisible.current = false
    },
    [],
  )
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
  const [inviteError, setInviteError] = useState<unknown>(null)
  function changeInviteOpen(open: boolean) {
    inviteVisible.current = open
    setInviteOpen(open)
    setInviteError(null)
  }

  async function invite() {
    if (invitation.pending) return
    setInviteError(null)
    const account = queryClient.getQueryData(
      authenticationQueryOptions().queryKey,
    )?.user?.id
    try {
      const recipients = parseCollaboratorEmails(emails)
      for (const email of recipients) {
        if (
          collaborators.some((person) => person.email.toLowerCase() === email)
        )
          throw new Error(`${email} is already a collaborator`)
      }
      const submittedEmails = emails
      await invitation.run({
        failureMessage: _t({ message: 'Could not invite collaborators.' }),
        handledError: (cause) =>
          inviteVisible.current && Boolean(collaboratorInviteFieldError(cause)),
        run: () =>
          addCollaborators({
            ...repositoryRequest(params),
            emails: submittedEmails,
          }),
        successMessage: (added) => {
          const invited = added.filter((person) => !person.userId).length
          return invited === added.length
            ? added.length === 1
              ? 'Invitation sent'
              : `${added.length} invitations sent`
            : added.length === 1
              ? 'Collaborator added'
              : `${added.length} collaborators added`
        },
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
          refreshQueries(queryClient, [
            collaboratorsQueryOptions(params).queryKey,
          ])
        },
      })
      setEmails('')
      changeInviteOpen(false)
    } catch (cause) {
      if (
        queryClient.getQueryData(authenticationQueryOptions().queryKey)?.user
          ?.id !== account
      )
        return
      if (inviteVisible.current && collaboratorInviteFieldError(cause))
        setInviteError(cause)
    }
  }

  async function remove() {
    if (!removing || removal.pending) return
    const collaborator = removing
    try {
      await removal.run({
        failureMessage: _t({ message: 'Could not remove collaborator.' }),
        successMessage: _t({ message: 'Collaborator removed' }),
        run: () =>
          deleteCollaborator({
            ...repositoryRequest(params),
            id: collaborator.id,
          }),
        confirmed: (_result, active) => {
          if (!active()) return
          queryClient.setQueryData(
            collaboratorsQueryOptions(params).queryKey,
            (previous) =>
              previous?.filter((person) => person.id !== collaborator.id),
          )
          refreshQueries(queryClient, [
            collaboratorsQueryOptions(params).queryKey,
          ])
        },
      })
      setRemoving(null)
    } catch {
      // The operation boundary reports this failure.
    }
  }

  const searchControl = (
    <SearchInput
      aria-label={_t({ message: 'Search collaborators' })}
      placeholder={_t({ message: 'Search collaborators…' })}
      value={search}
      onChange={(event) => setSearch(event.target.value)}
    />
  )

  return (
    <RepositoryAdminPage
      title={_t({ message: 'Collaborators' })}
      toolbar={searchControl}
      actions={
        <Button
          aria-label={_t({ message: 'Invite collaborator' })}
          className="max-md:size-8 max-md:p-0 max-md:has-data-[icon=inline-start]:pl-0 max-md:has-data-[icon=inline-end]:pr-0"
          onClick={() => {
            changeInviteOpen(true)
          }}
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
      <Table
        aria-label={_t({ message: 'Repository collaborators' })}
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
          {visibleCollaborators.length ? (
            visibleCollaborators.map((collaborator) => (
              <TableRow key={collaborator.id}>
                <TableCell>
                  <CollaboratorIdentity {...collaborator} />
                </TableCell>
                <TableCell>
                  <CollaboratorStatus
                    active={Boolean(collaborator.userId)}
                    expiresAt={collaborator.inviteExpiresAt}
                  />
                </TableCell>
                <TableCell className="py-0 text-right">
                  <Button
                    aria-label={_t({ message: `Remove ${collaborator.email}` })}
                    size="icon-sm"
                    variant="destructive"
                    disabled={removal.pending}
                    onClick={() => setRemoving(collaborator)}
                  >
                    <HugeiconsIcon aria-hidden="true" icon={Trash2} />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : !readError ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                className="text-center text-muted-foreground"
                colSpan={3}
              >
                {query
                  ? _t({ message: 'No matching collaborators.' })
                  : _t({ message: 'No collaborators yet.' })}
              </TableCell>
            </TableRow>
          ) : null}
          {readError ? (
            <TableErrorRow
              colSpan={3}
              message={_t({
                message:
                  'Could not refresh collaborators. The displayed results may be out of date.',
              })}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
          ) : null}
        </TableBody>
      </Table>

      <Dialog open={inviteOpen} onOpenChange={changeInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <UiTrans>Invite collaborators</UiTrans>
            </DialogTitle>
            <DialogDescription>
              <UiTrans>
                Invite one or more people to edit this repository.
              </UiTrans>
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void invite()
            }}
          >
            <CollaboratorInviteInput
              value={emails}
              onChange={(value) => {
                setEmails(value)
                setInviteError(null)
              }}
              disabled={inviting}
              error={collaboratorInviteFieldError(inviteError)}
            />
            <DialogFooter>
              <Button
                aria-busy={inviting}
                disabled={inviting || !emails.trim()}
                type="submit"
              >
                <UiTrans>Send invitations</UiTrans>
                {inviting ? (
                  <Spinner aria-hidden="true" data-icon="inline-end" />
                ) : null}
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
            <AlertDialogTitle>
              <UiTrans>Remove collaborator?</UiTrans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.email}{' '}
              <UiTrans>will lose access to this repository.</UiTrans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <UiTrans>Cancel</UiTrans>
            </AlertDialogCancel>
            <AlertDialogAction
              aria-busy={removal.pending}
              variant="destructive"
              disabled={removal.pending}
              onClick={(event) => {
                event.preventDefault()
                void remove()
              }}
            >
              <UiTrans>Remove</UiTrans>
              {removal.pending ? (
                <Spinner aria-hidden="true" data-icon="inline-end" />
              ) : null}
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
  repoId?: string
}) {
  const { t: _t } = useUiMessages()

  if (hasRepositoryCollaborators) {
    return (
      <RepositoryAdminPage title={_t({ message: 'Collaborators' })}>
        <RepositoryCollaboratorsContribution {...props} />
      </RepositoryAdminPage>
    )
  }
  return <BasicCollaboratorsPage {...props} />
}
