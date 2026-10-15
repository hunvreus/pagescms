import { Button } from '#/components/ui/button'
import { OperationError } from '#/components/operation-error'

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
          onClick={() => void draft.discard()}
        >
          Discard local draft
        </Button>
      </div>
      <OperationError
        error={draft.error}
        fallback="Could not restore or save the draft on this device. Keep this tab open."
      />
    </div>
  )
}
