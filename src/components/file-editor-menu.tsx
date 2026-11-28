import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import ArrowUpRight from '@hugeicons/core-free-icons/ArrowUpRight01Icon'
import EllipsisVertical from '@hugeicons/core-free-icons/EllipsisVerticalIcon'
import { Button } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import type { ReactNode, Ref } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

export function FileEditorMenu({
  href,
  disabled,
  onRename,
  onDelete,
  children,
  triggerRef,
  onCloseAutoFocus,
  busy = false,
}: {
  href?: string
  disabled?: boolean
  onRename?: () => void
  onDelete?: () => void
  children?: ReactNode
  triggerRef?: Ref<HTMLButtonElement>
  onCloseAutoFocus?: (event: Event) => void
  busy?: boolean
}) {
  const { t: _t } = useUiMessages()

  if (!href && !onRename && !onDelete && !children) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          aria-label={_t({ message: 'Entry actions' })}
          aria-busy={busy}
          disabled={disabled || busy}
          size="icon"
          variant="outline"
        >
          {busy ? (
            <Spinner aria-hidden="true" />
          ) : (
            <HugeiconsIcon aria-hidden="true" icon={EllipsisVertical} />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-max min-w-32 max-w-[calc(100vw-2rem)]"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children ? (
          <>
            <DropdownMenuGroup>{children}</DropdownMenuGroup>
            {href || onRename || onDelete ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {href ? (
          <DropdownMenuItem asChild>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap"
            >
              <UiTrans>View on GitHub</UiTrans>
              <HugeiconsIcon
                aria-hidden="true"
                icon={ArrowUpRight}
                className="ml-auto opacity-50"
              />
            </a>
          </DropdownMenuItem>
        ) : null}
        {href && (onRename || onDelete) ? <DropdownMenuSeparator /> : null}
        {onRename ? (
          <DropdownMenuItem onSelect={onRename}>
            <UiTrans>Rename</UiTrans>
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <UiTrans>Delete</UiTrans>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
