import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { CatchBoundary } from '@tanstack/react-router'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#/components/ui/dialog'
import { EditorSkeleton } from '#/components/editor-skeleton'
import { OperationError } from '#/components/operation-error'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  assertOperationAccount,
  accountIsActive,
} from '#/features/pending-writes/account-operation'
import { fieldValidationIssues } from '#/shared/field-validation-error'
import {
  withErrorNotification,
  OperationAcknowledgementError,
} from '#/lib/notifications'
import { isContentConflict } from '#/shared/content-conflict'
import { mergeField } from './draft-merge-fields'
import { equalMergeValue, mergeDraft } from './merge-draft'
import type { DraftMerge } from './merge-draft'
import type { DraftSession } from './draft-session'
import type { ReferenceContext } from '#/features/editor/fields/field-types'
import type { DraftMergeDialog as DraftMergeDialogComponent } from './draft-merge-dialog'

type LoadLatest<T> = () => Promise<{
  value: T
  sha: string | null
  onApplied?: () => void
}>

// React.lazy erases generic props; the loaded component keeps the same contract.
const DraftMergeDialog = lazy(() =>
  import('./draft-merge-dialog').then((module) => ({
    default: module.DraftMergeDialog,
  })),
) as typeof DraftMergeDialogComponent

export function useDraftMerge<T>(
  session: DraftSession<T> | undefined,
  label: string,
  fields?: unknown,
  context?: ReferenceContext,
) {
  const { t: _t } = useUiMessages()

  const client = useQueryClient()
  const mounted = useRef(false)
  const nextReview = useRef(0)
  const applied = useRef<{ id: number; value: T } | undefined>(undefined)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [review, setReview] = useState<{
    id: number
    plan: DraftMerge<T>
    mine: T
    remote: T
    sha: string | null
    onApplied?: () => void
    load: LoadLatest<T>
    save: () => Promise<void>
  }>()
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  async function openReview(load: LoadLatest<T>, save: () => Promise<void>) {
    if (!session) return
    setLoading(true)
    try {
      assertOperationAccount(client, session.summary.account)
      const latest = await load()
      if (
        !mounted.current ||
        !accountIsActive(client, session.summary.account)()
      )
        return
      const current = session.getSnapshot()
      setError(null)
      setReview({
        id: ++nextReview.current,
        plan: mergeDraft(
          current.base,
          current.value,
          latest.value,
          (path) => mergeField(path, fields)?.type === 'block',
        ),
        mine: current.value,
        remote: latest.value,
        sha: latest.sha,
        onApplied: latest.onApplied,
        load,
        save,
      })
    } finally {
      if (mounted.current) setLoading(false)
    }
  }
  async function handle(
    cause: unknown,
    load: LoadLatest<T>,
    save: () => Promise<void>,
  ) {
    if (!isContentConflict(cause) || !session) return false
    try {
      await openReview(load, save)
    } catch (failure) {
      if (mounted.current) setError(failure)
    }
    return true
  }
  function closeReview() {
    setError(null)
    setReview(undefined)
  }

  function applyReview(value: T) {
    if (!review || !session) return Promise.resolve()
    return withErrorNotification(
      async () => {
        assertOperationAccount(client, session.summary.account)
        const expected =
          applied.current?.id === review.id
            ? applied.current.value
            : review.mine
        if (!equalMergeValue(session.getSnapshot().value, expected))
          throw new Error(
            'Your draft changed during review. Close this dialog and review again.',
          )
        try {
          try {
            await session.applyMerge(value, review.remote, review.sha)
          } finally {
            // A storage failure can follow the in-memory rebase. Allow a
            // retry, while still rejecting unrelated edits during review.
            const current = session.getSnapshot()
            if (
              current.baseSha === review.sha &&
              equalMergeValue(current.value, value)
            )
              applied.current = { id: review.id, value }
          }
          assertOperationAccount(client, session.summary.account)
          review.onApplied?.()
          if (session.getSnapshot().dirty) await review.save()
          if (mounted.current) {
            setError(null)
            setReview(undefined)
          }
        } catch (cause) {
          if (cause instanceof OperationAcknowledgementError) {
            if (mounted.current) {
              setError(null)
              setReview(undefined)
            }
            throw cause
          }
          if (!isContentConflict(cause)) throw cause
          try {
            await openReview(review.load, review.save)
          } catch (failure) {
            if (mounted.current) setError(failure)
          }
        }
      },
      _t({ message: 'Could not save your changes. Your draft is retained.' }),
      {
        active: accountIsActive(client, session.summary.account),
        handled: (failure) => Boolean(fieldValidationIssues(failure)),
      },
    )
  }
  return {
    handle,
    error: review ? null : error,
    loading,
    clearError: () => setError(null),
    dialog:
      review &&
      session &&
      accountIsActive(client, session.summary.account)() ? (
        <CatchBoundary
          getResetKey={() => String(review.id)}
          errorComponent={({ error: failure }) => (
            <DraftReviewPending error={failure} onClose={closeReview} />
          )}
        >
          <Suspense fallback={<DraftReviewPending onClose={closeReview} />}>
            <DraftMergeDialog
              key={review.id}
              plan={review.plan}
              label={label}
              fields={fields}
              context={context}
              loadError={error}
              onClose={closeReview}
              onApply={applyReview}
            />
          </Suspense>
        </CatchBoundary>
      ) : null,
  }
}

function DraftReviewPending({
  onClose,
  error,
}: {
  onClose: () => void
  error?: unknown
}) {
  const { t: _t } = useUiMessages()

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <UiTrans>Review changes</UiTrans>
          </DialogTitle>
          <DialogDescription>
            <UiTrans>Your draft is retained while the review loads.</UiTrans>
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <OperationError
            error={error}
            title={_t({ message: 'Could not load change review' })}
            onRetry={() => window.location.reload()}
            retryLabel={_t({ message: 'Reload page' })}
          />
        ) : (
          <EditorSkeleton label={_t({ message: 'Loading change review' })} />
        )}
      </DialogContent>
    </Dialog>
  )
}
