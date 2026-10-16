import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { OperationError } from '#/components/operation-error'
import { DraftDiscardDialog } from './draft-discard-dialog'

export function ContentDraftRecovery({
  draft,
}: {
  draft: {
    status: string
    error: unknown
    download: () => void
    discard: () => Promise<void>
  }
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  if (!draft.error) return null
  return (
    <div className="space-y-2">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {draft.status}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={draft.download}>
          Download local draft
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmDiscard(true)}
        >
          Discard local draft
        </Button>
      </div>
      <OperationError
        error={draft.error}
        fallback="Could not restore or save the draft on this device. Keep this tab open."
      />
      <DraftDiscardDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={draft.discard}
      />
    </div>
  )
}
