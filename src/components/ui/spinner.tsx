import { useLingui as useUiMessages } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from 'cn'
import LoaderIcon from '@hugeicons/core-free-icons/LoaderIcon'

function Spinner({
  className,
  ...props
}: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) {
  const { t: _t } = useUiMessages()

  return (
    <HugeiconsIcon
      icon={LoaderIcon}
      data-slot="spinner"
      role="status"
      aria-label={_t({ message: 'Loading' })}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
