import { ArrowUpRight, EllipsisVertical } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

export function FileEditorMenu({
  href,
  disabled,
  onRename,
  onDelete,
}: {
  href?: string
  disabled?: boolean
  onRename?: () => void
  onDelete?: () => void
}) {
  if (!href && !onRename && !onDelete) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Entry actions"
          disabled={disabled}
          size="icon"
          variant="outline"
        >
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {href ? (
          <DropdownMenuItem asChild>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap"
            >
              View on GitHub
              <ArrowUpRight className="ml-auto opacity-50" />
            </a>
          </DropdownMenuItem>
        ) : null}
        {href && (onRename || onDelete) ? <DropdownMenuSeparator /> : null}
        {onRename ? (
          <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
