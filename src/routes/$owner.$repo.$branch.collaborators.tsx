import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { LoaderCircle, Trash2, UserPlus } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { OperationError } from '#/components/operation-error'
import { Textarea } from '#/components/ui/textarea'
import {
  addCollaborators,
  deleteCollaborator,
  getCollaborators,
} from '#/functions/collaborators'
import { getSignInUrl } from '#/lib/auth-redirect'

export const Route = createFileRoute('/$owner/$repo/$branch/collaborators')({
  loader: async ({ params }) => {
    try {
      return await getCollaborators({ data: params })
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
  staleTime: 15_000,
  pendingMs: 100,
  pendingComponent: CollaboratorSkeleton,
  component: CollaboratorsPage,
})

function CollaboratorsPage() {
  const collaborators = Route.useLoaderData()
  const params = Route.useParams()
  const router = useRouter()
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
      await router.invalidate()
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
      await router.invalidate()
    } catch (cause) {
      setError(cause)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <p className="text-sm text-muted-foreground">
          Access is limited to {params.branch}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Collaborators</h1>
      </header>
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
          {inviting ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
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
                onClick={() => void remove(collaborator.id, collaborator.email)}
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
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-xs">
          No collaborators have been invited.
        </div>
      )}
    </div>
  )
}

function CollaboratorSkeleton() {
  return (
    <div
      className="mx-auto h-72 max-w-3xl animate-pulse rounded-xl border bg-card"
      aria-label="Loading collaborators"
    />
  )
}
