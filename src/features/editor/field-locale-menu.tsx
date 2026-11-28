import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import Globe from '@hugeicons/core-free-icons/Globe02Icon'
import ChevronDown from '@hugeicons/core-free-icons/ChevronDownIcon'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '#/components/ui/dialog'
import { localeMenuClassName } from './locale-context'
import type { Locale } from '#/lib/i18n'
import type { JsonObject } from '#/shared/json'

export function FieldLocaleMenu({
  locale,
  locales,
  value,
  label,
  onCopy,
  onSelect,
}: {
  locale: string
  locales: Locale[]
  value: JsonObject
  label: string
  onCopy?: (source: string) => void
  onSelect?: (locale: string) => void
}) {
  const { t: _t } = useUiMessages()

  const [source, setSource] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const sources = locales.filter(
    (item) => item.code !== locale && Object.hasOwn(value, item.code),
  )
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Badge variant="secondary" className="hover:bg-secondary/80" asChild>
            <button
              type="button"
              aria-label={_t({
                message: `${label}: ${locales.find((item) => item.code === locale)?.label ?? locale} language`,
              })}
            >
              <HugeiconsIcon
                icon={Globe}
                aria-hidden="true"
                data-icon="inline-start"
              />
              {locales.find((item) => item.code === locale)?.label ?? locale}
              <HugeiconsIcon
                icon={ChevronDown}
                className="text-muted-foreground"
                aria-hidden="true"
                data-icon="inline-end"
              />
            </button>
          </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={localeMenuClassName}>
          {onCopy && sources.length ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <UiTrans>Copy from…</UiTrans>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={localeMenuClassName}>
                {sources.map((item) => (
                  <DropdownMenuItem
                    key={item.code}
                    onSelect={() => {
                      if (Object.hasOwn(value, locale)) {
                        setSource(item.code)
                        setOpen(true)
                      } else onCopy(item.code)
                    }}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <DropdownMenuItem disabled>
              <UiTrans>Copy from…</UiTrans>
            </DropdownMenuItem>
          )}
          {onSelect ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <UiTrans>Switch language</UiTrans>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={localeMenuClassName}>
                  {locales.map((item) => (
                    <DropdownMenuItem
                      key={item.code}
                      disabled={item.code === locale}
                      onSelect={() => onSelect(item.code)}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <UiTrans>Replace this field’s translation?</UiTrans>
            </DialogTitle>
            <DialogDescription>
              <UiTrans>
                Replace {label} in{' '}
                {locales.find((item) => item.code === locale)?.label} with its
                value from {locales.find((item) => item.code === source)?.label}
                . This includes unsaved changes to this field. Changes stay in
                your draft until you save.
              </UiTrans>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              <UiTrans>Cancel</UiTrans>
            </Button>
            <Button
              onClick={() => {
                if (source && Object.hasOwn(value, source)) onCopy?.(source)
                setOpen(false)
              }}
            >
              <UiTrans>Replace translation</UiTrans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
