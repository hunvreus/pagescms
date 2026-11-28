import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { useEffect, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { Field, FieldLabel } from '#/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '#/components/ui/dialog'

export function CommitMessageDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (message: string) => void
  onCancel: () => void
}) {
  const { t: _t } = useUiMessages()

  const [message, setMessage] = useState('')
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <UiTrans>Save changes</UiTrans>
          </DialogTitle>
          <DialogDescription>
            <UiTrans>Choose a message for this content save.</UiTrans>
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="entry-commit-message">
            <UiTrans>Commit message (optional)</UiTrans>
          </FieldLabel>
          <Textarea
            autoFocus
            id="entry-commit-message"
            maxLength={4096}
            placeholder={_t({
              message: 'Leave blank to use the configured message',
            })}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            <UiTrans>Cancel</UiTrans>
          </Button>
          <Button type="button" onClick={() => onConfirm(message.trim())}>
            <UiTrans>Save changes</UiTrans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function useCommitMessage(enabled: boolean) {
  const [open, setOpen] = useState(false)
  const resolver = useRef<((message: string | null) => void) | undefined>(
    undefined,
  )
  useEffect(
    () => () => {
      resolver.current?.(null)
    },
    [],
  )
  function finish(message: string | null) {
    setOpen(false)
    resolver.current?.(message)
    resolver.current = undefined
  }
  return {
    request: (): Promise<string | null | undefined> => {
      if (!enabled) return Promise.resolve(undefined)
      setOpen(true)
      return new Promise((resolve) => {
        resolver.current = resolve
      })
    },
    dialog: open ? (
      <CommitMessageDialog onConfirm={finish} onCancel={() => finish(null)} />
    ) : null,
  }
}
