import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { LoaderCircle, Trash2, UserPlus } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { OperationError } from '#/components/operation-error'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Textarea } from '#/components/ui/textarea'
import { addCollaborators, deleteCollaborator } from '#/functions/collaborators'
import { getSignInUrl } from '#/lib/auth-redirect'
import { collaboratorsQueryOptions } from '#/queries/repository'

export const Route = createFileRoute('/$owner/$repo/$branch/collaborators')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(
        collaboratorsQueryOptions(params),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/collaborators`,
          ),
        })
      }
      throw error
    }
  },
  pendingMs: 100,
  pendingComponent: CollaboratorSkeleton,
  component: CollaboratorsPage,
})

function CollaboratorsPage() {
  const params = Route.useParams()
  const { data: collaborators } = useSuspenseQuery(
    collaboratorsQueryOptions(params),
  )
  const queryClient = useQueryClient()
  const [emails, setEmails] = useState('')
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<number | null>(null)
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
      await queryClient.invalidateQueries({
        queryKey: collaboratorsQueryOptions(params).queryKey,
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setInviting(false)
    }
  }

  async function remove(id: number, email: string) {
    if (!window.confirm(`Remove ${email} from this repository?`)) return
    setRemoving(id)
    setError(null)
    try {
      await deleteCollaborator({ data: { ...params, id } })
      await queryClient.invalidateQueries({
        queryKey: collaboratorsQueryOptions(params).queryKey,
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="-m-4 md:-m-6">
      <RepositoryPageHeader>
        <RepositoryPageTitle
          description={`Access is limited to ${params.branch}`}
        >
          Collaborators
        </RepositoryPageTitle>
      </RepositoryPageHeader>
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        <form
          className="space-y-3 rounded-xl border bg-card p-5 shadow-xs"
          onSubmit={(event) => {
            event.preventDefault()
            void invite()
          }}
        >
          <label className="block space-y-2">
            <span className="text-sm font-medium">Invite by email</span>
            <Textarea
              placeholder="alice@example.com, bob@example.com"
              rows={4}
              value={emails}
              onChange={(event) => setEmails(event.target.value)}
            />
            <span className="block text-xs text-muted-foreground">
              Separate addresses with commas or new lines. New users receive a
              24-hour invitation link.
            </span>
          </label>
          <Button disabled={inviting || !emails.trim()} type="submit">
            {inviting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <UserPlus />
            )}
            {inviting ? 'Inviting' : 'Invite'}
          </Button>
        </form>
        <OperationError
          error={error}
          fallback="Could not update collaborators."
        />
        {collaborators.length ? (
          <ul className="overflow-hidden rounded-xl border bg-card shadow-xs">
            {collaborators.map((collaborator) => (
              <li
                className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0"
                key={collaborator.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{collaborator.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {collaborator.userId ? 'Active' : 'Invitation pending'} ·{' '}
                    {collaborator.branch ?? 'All branches'}
                  </p>
                </div>
                <Button
                  aria-label={`Remove ${collaborator.email}`}
                  disabled={removing === collaborator.id}
                  size="icon"
                  variant="destructive"
                  onClick={() =>
                    void remove(collaborator.id, collaborator.email)
                  }
                >
                  {removing === collaborator.id ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty className="border bg-card shadow-xs">
            <EmptyHeader>
              <EmptyTitle>No collaborators yet</EmptyTitle>
              <EmptyDescription>
                No collaborators have been invited.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  )
}

function CollaboratorSkeleton() {
  return (
    <div className="-m-4 md:-m-6" aria-label="Loading collaborators">
      <RepositoryPageHeader>
        <Skeleton className="h-5 w-32" />
      </RepositoryPageHeader>
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  )
}
