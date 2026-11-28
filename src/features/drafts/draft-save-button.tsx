import { useLingui } from '@lingui/react'
import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import ArrowDown01Icon from '@hugeicons/core-free-icons/ArrowDown01Icon'
import { Spinner } from '#/components/ui/spinner'
import { useEffect, useId, useRef, useState } from 'react'
import { formatDistanceToNow } from '#/i18n/dates'
import { Button } from '#/components/ui/button'
import { userFacingError } from '#/lib/access-denial'
import type { DraftState } from './draft-session'
import { DraftDiscardDialog } from './draft-discard-dialog'
import { relativeAge } from './relative-age'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '#/components/ui/popover'

export type DraftControls = Pick<
  DraftState<unknown>,
  'dirty' | 'ready' | 'savedAt' | 'error' | 'attentionRevision'
> & {
  discard: () => Promise<void>
  download: () => void
}

function DraftDetails({
  draft,
  busy,
  disabled,
}: {
  draft: DraftControls
  busy: boolean
  disabled: boolean
}) {
  const { t: _t } = useUiMessages()
  const { i18n: dateI18n } = useLingui()

  const titleId = useId()
  const popoverRef = useRef<HTMLDivElement>(null)
  const automaticallyOpening = useRef(false)
  const isOpen = useRef(false)
  const [open, setOpen] = useState(false)
  isOpen.current = open
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const failed = Boolean(draft.error)
  // A blocked restore has a known incompatible draft even if it has no timestamp.
  const canDownload =
    draft.dirty || draft.savedAt !== null || (failed && !draft.ready)
  useEffect(() => {
    if (!failed || disabled) return
    const timer = setTimeout(() => {
      if (isOpen.current) return
      automaticallyOpening.current = true
      setOpen(true)
    }, 0)
    return () => clearTimeout(timer)
  }, [failed, disabled, draft.attentionRevision])
  const age =
    draft.savedAt === null
      ? null
      : relativeAge(draft.savedAt, now, dateI18n.locale)
  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => !confirmDiscard && setOpen(next)}
      >
        <PopoverTrigger asChild>
          <Button
            variant={failed ? 'destructive' : 'secondary'}
            className={failed ? undefined : 'text-muted-foreground'}
            type="button"
            disabled={disabled}
            aria-label={
              failed
                ? _t({ message: 'Local draft: needs attention' })
                : _t({ message: `Local draft: ${age}` })
            }
          >
            <UiTrans>Draft</UiTrans>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-3 opacity-50"
              aria-hidden="true"
              data-icon="inline-end"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={popoverRef}
          align="start"
          collisionPadding={16}
          aria-labelledby={titleId}
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            if (automaticallyOpening.current) {
              automaticallyOpening.current = false
              return
            }
            popoverRef.current?.focus()
          }}
        >
          <PopoverHeader>
            <PopoverTitle id={titleId}>
              <UiTrans>Local draft</UiTrans>
            </PopoverTitle>
            <PopoverDescription>
              {draft.savedAt !== null ? (
                <>
                  <UiTrans>Last saved in this browser</UiTrans>{' '}
                  {formatDistanceToNow(
                    draft.savedAt,
                    { addSuffix: true },
                    dateI18n.locale,
                  )}
                  .{' '}
                </>
              ) : null}
              <UiTrans>
                These changes haven’t been saved to your project.
              </UiTrans>
            </PopoverDescription>
            {failed ? (
              <p className="mt-1 text-destructive">
                {userFacingError(
                  draft.error,
                  _t({
                    message:
                      'Could not restore or save this draft. Keep this editor open.',
                  }),
                  dateI18n,
                )}
              </p>
            ) : null}
          </PopoverHeader>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              aria-label={_t({ message: 'Discard draft' })}
              disabled={disabled || busy}
              onClick={() => setConfirmDiscard(true)}
            >
              <UiTrans>Discard</UiTrans>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={_t({ message: 'Download draft' })}
              disabled={!canDownload}
              onClick={draft.download}
            >
              <UiTrans>Download</UiTrans>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {failed ? (
        <span role="status" className="sr-only">
          <UiTrans>
            Your local draft needs attention. Open Draft for details.
          </UiTrans>
        </span>
      ) : null}
      <DraftDiscardDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={async () => {
          await draft.discard()
          setOpen(false)
        }}
      />
    </>
  )
}

export function DraftBadge({
  draft,
  busy = false,
  disabled = false,
}: {
  draft: DraftControls
  busy?: boolean
  disabled?: boolean
}) {
  return (draft.dirty && draft.savedAt !== null) || Boolean(draft.error) ? (
    <DraftDetails draft={draft} busy={busy} disabled={disabled} />
  ) : null
}

export function DraftSaveButton({
  draft,
  busy,
  disabled = false,
  invalid = false,
  label = 'Save',
  requireChanges = true,
  onSave,
}: {
  draft: DraftControls
  busy: boolean
  disabled?: boolean
  invalid?: boolean
  label?: string
  requireChanges?: boolean
  onSave: () => void
}) {
  return (
    <Button
      aria-busy={busy}
      type="button"
      disabled={
        disabled ||
        busy ||
        (requireChanges && !draft.dirty) ||
        !draft.ready ||
        invalid
      }
      onClick={onSave}
    >
      {label}
      {busy ? <Spinner aria-hidden="true" data-icon="inline-end" /> : null}
    </Button>
  )
}
