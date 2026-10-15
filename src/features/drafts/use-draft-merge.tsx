import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  assertOperationAccount,
  accountIsActive,
} from '#/features/operations/account-operation'
import { isContentConflict } from '#/lib/content-conflict'
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
    hasBase: boolean
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
        hasBase: Boolean(current.base),
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
  return {
    handle,
    error,
    loading,
    clearError: () => setError(null),
    dialog:
      review &&
      session &&
      accountIsActive(client, session.summary.account)() ? (
        <Suspense fallback={null}>
          <DraftMergeDialog
            key={review.id}
            plan={review.plan}
            hasBase={review.hasBase}
            label={label}
            fields={fields}
            context={context}
            onClose={() => setReview(undefined)}
            onApply={async (value) => {
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
                if (mounted.current) setReview(undefined)
              } catch (cause) {
                if (!isContentConflict(cause)) throw cause
                await openReview(review.load, review.save)
              }
            }}
          />
        </Suspense>
      ) : null,
  }
}
