import { Trans as UiTrans } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { accountIsActive } from '#/features/pending-writes/account-operation'
import { useAccountPreferences } from '#/features/account/use-account-preferences'
import { useEffect, useState } from 'react'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Label } from '#/components/ui/label'
import { Spinner } from '#/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '#/components/ui/dialog'
import {
  rememberTranslationPreference,
  translationPreference,
} from './translation-preferences'

export function StartTranslationDialog({
  open,
  onOpenChange,
  language,
  source,
  account,
  canCopy,
  busy = false,
  onStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  language?: string
  source: string
  account?: string
  canCopy: boolean
  busy?: boolean
  onStart: (copy: boolean) => void
}) {
  const client = useQueryClient()
  const preferences = useAccountPreferences(account)
  const pending = busy || preferences.busy
  const [copy, setCopy] = useState(false)
  const [remember, setRemember] = useState(false)
  useEffect(() => {
    if (open) {
      // This browser-local checkbox hint is separate from the synced start mode.
      setCopy(translationPreference(account, 'copy-on-start') === 'true')
      setRemember(false)
    }
  }, [open, account])
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value)
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            <UiTrans>Start {language} translation</UiTrans>
          </DialogTitle>
          <DialogDescription>
            <UiTrans>
              Start a blank draft or copy the content you are viewing, including
              unsaved changes. An existing local draft will be resumed. Nothing
              is published until you save.
            </UiTrans>
          </DialogDescription>
        </DialogHeader>
        <Label>
          <Checkbox
            checked={copy && canCopy}
            disabled={!canCopy || pending}
            onCheckedChange={(checked) => setCopy(checked === true)}
          />
          <UiTrans>Copy {source} content</UiTrans>
        </Label>
        <Label>
          <Checkbox
            checked={remember}
            disabled={pending || !canCopy || !preferences.canSave}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          <UiTrans>Remember this choice and skip this prompt</UiTrans>
        </Label>
        <p className="text-sm text-muted-foreground">
          <UiTrans>You can change this in Account → Content editing.</UiTrans>
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            <UiTrans>Cancel</UiTrans>
          </Button>
          <Button
            disabled={pending || !preferences.ready}
            aria-busy={pending}
            onClick={async () => {
              if (canCopy)
                rememberTranslationPreference(
                  account,
                  'copy-on-start',
                  String(copy),
                )
              if (remember && canCopy)
                await preferences.save({
                  newTranslations: copy ? 'copy' : 'blank',
                })
              if (account && !accountIsActive(client, account)()) return
              onStart(copy && canCopy)
            }}
          >
            <UiTrans>Start translation</UiTrans>
            {pending ? (
              <Spinner aria-hidden="true" data-icon="inline-end" />
            ) : null}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
