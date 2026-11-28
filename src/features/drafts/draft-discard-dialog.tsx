import { Trans as UiTrans, useLingui } from '@lingui/react/macro'
import { Spinner } from '#/components/ui/spinner'
import { useState } from 'react'
import { withErrorNotification } from '#/lib/notifications'
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => Promise<void>
}) {
  const { t: _t } = useLingui()
  const [busy, setBusy] = useState(false)

  function close(next: boolean) {
    if (busy) return
    onOpenChange(next)
  }

  async function discard() {
    setBusy(true)
    try {
      await withErrorNotification(
        async () => {
          await onDiscard()
          onOpenChange(false)
        },
        _t({ message: 'Could not discard this draft.' }),
      )
    } catch {
      // The notification boundary owns this failure.
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <UiTrans>Discard local draft?</UiTrans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <UiTrans>
              Discard your unsaved changes from this browser. This cannot be
              undone. Saved content in your project will not change.
            </UiTrans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            <UiTrans>Cancel</UiTrans>
          </AlertDialogCancel>
          <AlertDialogAction
            aria-busy={busy}
            disabled={busy}
            onClick={(event) => {
              event.preventDefault()
              void discard()
            }}
          >
            <UiTrans>Discard draft</UiTrans>
            {busy ? (
              <Spinner aria-hidden="true" data-icon="inline-end" />
            ) : null}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
