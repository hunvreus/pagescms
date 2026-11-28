import { useLingui as useUiMessages } from '@lingui/react/macro'
import { Skeleton } from '#/components/ui/skeleton'
import { cn } from 'cn'

export function EditorSkeleton({
  className,
  label,
}: {
  className?: string
  label?: string
}) {
  const { t: defaultT } = useUiMessages()
  return (
    <Skeleton
      role="status"
      className={cn('min-h-32 w-full rounded-md', className)}
      aria-label={label ?? defaultT({ message: 'Loading editor' })}
      aria-busy="true"
    />
  )
}
