import { useEffect, useId, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { LoaderCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { DraftDiscardDialog } from './draft-discard-dialog'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '#/components/ui/popover'

function DraftDetails({
  savedAt,
  disabled,
  onDiscard,
}: {
  savedAt: number
  disabled: boolean
  onDiscard: () => Promise<void>
}) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const elapsed = Math.max(0, now - savedAt)
  const unit = (
    [
      [86_400_000, 'd'],
      [3_600_000, 'h'],
      [60_000, 'm'],
    ] as const
  ).find(([duration]) => elapsed >= duration)
  const age = unit
    ? `${Math.floor(elapsed / unit[0])}${unit[1]} ago`
    : 'Just now'
  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => !confirmDiscard && setOpen(next)}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="font-normal text-muted-foreground"
            disabled={disabled}
            aria-label={`Local draft: ${age}`}
          >
            <time dateTime={new Date(savedAt).toISOString()}>{age}</time>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" aria-labelledby={titleId}>
          <PopoverHeader>
            <PopoverTitle id={titleId}>Local draft</PopoverTitle>
            <PopoverDescription>
              Last saved in this browser{' '}
              {formatDistanceToNow(savedAt, { addSuffix: true })}. These changes
              haven’t been saved to your project.
            </PopoverDescription>
          </PopoverHeader>
          <p className="text-muted-foreground">
            Discarding removes your unsaved changes and restores the last loaded
            or saved version.
          </p>
          <Button
            type="button"
            variant="destructive"
            disabled={disabled}
            onClick={() => setConfirmDiscard(true)}
          >
            Discard draft
          </Button>
        </PopoverContent>
      </Popover>
      <DraftDiscardDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={async () => {
          await onDiscard()
          setOpen(false)
        }}
      />
    </>
  )
}

export function DraftSaveButton({
  dirty,
  ready,
  busy,
  savedAt,
  disabled = false,
  invalid = false,
  label = 'Save',
  requireChanges = true,
  onSave,
  onDiscard,
}: {
  dirty: boolean
  ready: boolean
  busy: boolean
  savedAt: number | null
  disabled?: boolean
  invalid?: boolean
  label?: string
  requireChanges?: boolean
  onSave: () => void
  onDiscard: () => Promise<void>
}) {
  return (
    <div className="flex items-center gap-2" aria-label="Save and local draft">
      {dirty && savedAt !== null ? (
        <DraftDetails
          savedAt={savedAt}
          disabled={disabled || busy || !ready}
          onDiscard={onDiscard}
        />
      ) : null}
      <Button
        type="button"
        disabled={
          disabled || busy || (requireChanges && !dirty) || !ready || invalid
        }
        onClick={onSave}
      >
        {busy ? <LoaderCircle className="animate-spin" /> : null}
        {busy ? (label === 'Save' ? 'Saving' : 'Creating') : label}
      </Button>
    </div>
  )
}
