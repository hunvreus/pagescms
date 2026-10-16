import { useState } from 'react'
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

export function DraftDiscardDialog({
  open,
  onOpenChange,
  onDiscard,
  entryTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => Promise<void>
  entryTitle?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  function close(next: boolean) {
    if (busy) return
    setError(null)
    onOpenChange(next)
  }

  async function discard() {
    setBusy(true)
    setError(null)
    try {
      await onDiscard()
      onOpenChange(false)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard local draft?</AlertDialogTitle>
          <AlertDialogDescription>
            {entryTitle
              ? `Discard unsaved changes to “${entryTitle}” from this browser.`
              : 'Discard your unsaved changes from this browser.'}{' '}
            This cannot be undone. Saved content in your project will not
            change.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <OperationError
          error={error}
          fallback="Could not discard this draft."
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              void discard()
            }}
          >
            {busy ? 'Discarding…' : 'Discard draft'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
