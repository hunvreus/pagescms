import { CircleAlert } from 'lucide-react'

import { Alert, AlertAction, AlertDescription } from '#/components/ui/alert'
import { cn } from '#/lib/utils'

export function ErrorAlert({
  action,
  children,
  className,
}: {
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Alert className={cn(action && 'pr-24', className)} variant="destructive">
      <CircleAlert />
      <AlertDescription>{children}</AlertDescription>
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  )
}
