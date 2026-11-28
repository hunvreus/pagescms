import { Trans as UiTrans } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { useLocaleSelection } from './locale-selection'
import { createContext, useState } from 'react'
import Globe from '@hugeicons/core-free-icons/Globe02Icon'
import ChevronDown from '@hugeicons/core-free-icons/ChevronDownIcon'
import Check from '@hugeicons/core-free-icons/CheckIcon'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Label } from '#/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '#/components/ui/dropdown-menu'
import type { JsonObject } from '#/shared/json'
import type { Locale } from '#/lib/i18n'

export const LocaleContext = createContext<{
  locale: string
  defaultLocale?: string
  locales: Locale[]
  inherited?: boolean
  onSelect?: (code: string) => void
  boundary?: {
    path: string
    value: JsonObject
    onChange: (value: JsonObject) => void
  }
} | null>(null)
export function LocaleMenuTrigger({ label }: { label: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <Button
        variant="outline"
        type="button"
        title={label}
        className="max-w-48 @max-[48rem]/header:size-8 @max-[48rem]/header:p-0"
      >
        <HugeiconsIcon
          icon={Globe}
          aria-hidden="true"
          data-icon="inline-start"
        />
        <span className="truncate @max-[48rem]/header:sr-only">{label}</span>
        <HugeiconsIcon
          icon={ChevronDown}
          className="text-muted-foreground @max-[48rem]/header:hidden"
          aria-hidden="true"
          data-icon="inline-end"
        />
      </Button>
    </DropdownMenuTrigger>
  )
}

export const localeMenuClassName =
  'w-max min-w-32 max-w-[calc(100vw-2rem)] max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto whitespace-nowrap'

export function LocaleMenu({
  locale,
  locales,
  onSelect,
  onCopy,
  onStart,
  account,
  ready = true,
  copySources,
  onRemove,
  pending = [],
  errors = [],
}: {
  locale: string
  locales: Locale[]
  onSelect: (locale: string) => void
  onCopy?: (source: string, replace: boolean) => void
  onStart?: (target: string, copy: boolean) => void
  account?: string
  ready?: boolean
  copySources?: string[]
  onRemove?: () => void
  pending?: string[]
  errors?: string[]
}) {
  const sources = locales.filter(
    (item) =>
      item.code !== locale && (!copySources || copySources.includes(item.code)),
  )
  const [source, setSource] = useState<string | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [replace, setReplace] = useState(false)
  const [removing, setRemoving] = useState(false)
  const selection = useLocaleSelection({
    locale,
    locales,
    available: copySources,
    account,
    ready,
    onSelect,
    onStart,
  })
  return (
    <>
      <DropdownMenu>
        <LocaleMenuTrigger
          label={locales.find((item) => item.code === locale)?.label ?? locale}
        />
        <DropdownMenuContent align="end" className={localeMenuClassName}>
          {locales.map((item) => (
            <DropdownMenuItem
              key={item.code}
              disabled={!ready || item.code === locale}
              onSelect={() => selection.select(item.code)}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {pending.includes(item.code) ? (
                <span className="text-xs text-muted-foreground">
                  <UiTrans>Unsaved</UiTrans>
                </span>
              ) : null}
              {errors.includes(item.code) ? (
                <span className="text-xs text-muted-foreground">
                  <UiTrans>Errors</UiTrans>
                </span>
              ) : null}
              {item.code === locale ? (
                <HugeiconsIcon
                  icon={Check}
                  className="ml-auto"
                  aria-hidden="true"
                />
              ) : null}
            </DropdownMenuItem>
          ))}
          {onCopy && sources.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={!ready}>
                  <UiTrans>Copy from…</UiTrans>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={localeMenuClassName}>
                  {sources.map((item) => (
                    <DropdownMenuItem
                      key={item.code}
                      onSelect={() => {
                        setReplace(false)
                        setSource(item.code)
                        setCopyOpen(true)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          )}
          {onRemove ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!ready}
                onSelect={() => setRemoving(true)}
              >
                <UiTrans>Remove this language…</UiTrans>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {selection.dialog}
      <Dialog
        open={copyOpen}
        onOpenChange={(open) => {
          if (!open) setCopyOpen(false)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <UiTrans>Copy content</UiTrans>
            </DialogTitle>
            <DialogDescription>
              <UiTrans>
                Copy localized content from{' '}
                {locales.find((item) => item.code === source)?.label} to{' '}
                {locales.find((item) => item.code === locale)?.label}. Changes
                stay in your draft until you save. Shared fields stay unchanged.
              </UiTrans>
            </DialogDescription>
          </DialogHeader>
          <Label>
            <Checkbox
              checked={replace}
              onCheckedChange={(value) => setReplace(value === true)}
            />
            <UiTrans>Replace existing translations</UiTrans>
          </Label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              <UiTrans>Cancel</UiTrans>
            </Button>
            <Button
              onClick={() => {
                if (source) onCopy?.(source, replace)
                setCopyOpen(false)
              }}
            >
              <UiTrans>Copy content</UiTrans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <UiTrans>Remove this language's content?</UiTrans>
            </DialogTitle>
            <DialogDescription>
              <UiTrans>
                Remove localized values for{' '}
                {locales.find((item) => item.code === locale)?.label}. Other
                languages and shared fields stay unchanged. This changes your
                draft until you save.
              </UiTrans>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(false)}>
              <UiTrans>Cancel</UiTrans>
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onRemove?.()
                setRemoving(false)
              }}
            >
              <UiTrans>Remove content</UiTrans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
