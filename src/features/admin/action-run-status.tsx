import {
  CircleCheck,
  CircleX,
  Clock,
  CircleMinus,
  CircleAlert,
  LoaderCircle,
} from 'lucide-react'
import { Badge } from '#/components/ui/badge'

// GitHub values stay separate from presentation labels for future localization.
const statuses = {
  queued: { label: 'Queued', icon: Clock },
  requested: { label: 'Requested', icon: Clock },
  waiting: { label: 'Waiting', icon: Clock },
  pending: { label: 'Pending', icon: Clock },
  in_progress: { label: 'In progress', icon: LoaderCircle },
  completed: { label: 'Completed', icon: CircleCheck },
  success: { label: 'Success', icon: CircleCheck },
  failure: { label: 'Failure', icon: CircleX },
  timed_out: { label: 'Timed out', icon: CircleAlert },
  cancelled: { label: 'Cancelled', icon: CircleMinus },
  skipped: { label: 'Skipped', icon: CircleMinus },
  neutral: { label: 'Neutral', icon: CircleMinus },
  action_required: { label: 'Action required', icon: CircleAlert },
  stale: { label: 'Stale', icon: CircleAlert },
  startup_failure: { label: 'Startup failure', icon: CircleX },
} as const

export function ActionRunStatus({
  status,
  conclusion,
}: {
  status: string
  conclusion?: string | null
}) {
  const value = conclusion ?? status
  const presentation = Object.hasOwn(statuses, value)
    ? statuses[value as keyof typeof statuses]
    : { label: 'Unknown', icon: CircleAlert }
  const Icon = presentation.icon
  const failed = ['failure', 'timed_out', 'startup_failure'].includes(value)
  return (
    <Badge
      variant={failed ? 'destructive' : 'secondary'}
      className={
        ['queued', 'requested', 'waiting', 'pending', 'in_progress'].includes(
          value,
        )
          ? 'text-muted-foreground'
          : undefined
      }
    >
      <Icon
        aria-hidden="true"
        className={value === 'in_progress' ? 'animate-spin' : undefined}
      />
      {presentation.label}
    </Badge>
  )
}
