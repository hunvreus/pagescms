import { Pencil } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { OperationError } from '#/components/operation-error'
import type { DraftState } from './draft-session'

/** Quiet acknowledgement of a persisted local draft, separate from GitHub saving. */
export function ContentDraftIndicator({
  draft,
  saving = false,
}: {
  draft: Pick<DraftState<unknown>, 'ready' | 'dirty' | 'error' | 'status'>
  saving?: boolean
}) {
  if (!draft.ready || !draft.dirty || draft.error || saving) return null
  const persisted =
    draft.status === 'Saved on this device' ||
    draft.status === 'Restored draft saved on this device'
  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex w-6 shrink-0 justify-center text-muted-foreground"
    >
      {persisted ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="img"
                aria-label="Unsaved changes"
                tabIndex={0}
                className="inline-flex size-6 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil aria-hidden="true" className="size-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" sideOffset={6}>
              Unsaved changes
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
    </span>
  )
}

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
