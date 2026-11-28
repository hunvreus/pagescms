import { useLingui } from '@lingui/react'
import { localizeErrorMessage } from '#/i18n/errors'
import { HugeiconsIcon } from '@hugeicons/react'
import CircleAlert from '@hugeicons/core-free-icons/AlertCircleIcon'

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#/components/ui/alert'
import { cn } from 'cn'

export function ErrorAlert({
  action,
  title,
  children,
  className,
}: {
  action?: React.ReactNode
  title?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const { i18n } = useLingui()
  return (
    <Alert className={cn(action && 'pr-24', className)} variant="destructive">
      <HugeiconsIcon aria-hidden="true" icon={CircleAlert} />
      {title ? (
        <AlertTitle>
          {typeof title === 'string'
            ? localizeErrorMessage(i18n, title)
            : title}
        </AlertTitle>
      ) : null}
      <AlertDescription>
        {typeof children === 'string'
          ? localizeErrorMessage(i18n, children)
          : children}
      </AlertDescription>
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  )
}
