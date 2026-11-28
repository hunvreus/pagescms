import { msg } from '@lingui/core/macro'
import { useLingui as useUiMessages } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import CircleCheck from '@hugeicons/core-free-icons/CircleCheckIcon'
import CircleX from '@hugeicons/core-free-icons/CircleXIcon'
import Clock from '@hugeicons/core-free-icons/Clock01Icon'
import CircleMinus from '@hugeicons/core-free-icons/CircleMinusIcon'
import CircleAlert from '@hugeicons/core-free-icons/AlertCircleIcon'
import LoaderIcon from '@hugeicons/core-free-icons/LoaderIcon'
import { Badge } from '#/components/ui/badge'

// GitHub values stay separate from presentation labels for future localization.
const statuses = {
  queued: { label: msg({ message: 'Queued' }), icon: Clock },
  requested: { label: msg({ message: 'Requested' }), icon: Clock },
  waiting: { label: msg({ message: 'Waiting' }), icon: Clock },
  pending: { label: msg({ message: 'Pending' }), icon: Clock },
  in_progress: { label: msg({ message: 'In progress' }), icon: LoaderIcon },
  completed: { label: msg({ message: 'Completed' }), icon: CircleCheck },
  success: { label: msg({ message: 'Success' }), icon: CircleCheck },
  failure: { label: msg({ message: 'Failure' }), icon: CircleX },
  timed_out: { label: msg({ message: 'Timed out' }), icon: CircleAlert },
  cancelled: { label: msg({ message: 'Cancelled' }), icon: CircleMinus },
  skipped: { label: msg({ message: 'Skipped' }), icon: CircleMinus },
  neutral: { label: msg({ message: 'Neutral' }), icon: CircleMinus },
  action_required: {
    label: msg({ message: 'Action required' }),
    icon: CircleAlert,
  },
  stale: { label: msg({ message: 'Stale' }), icon: CircleAlert },
  startup_failure: {
    label: msg({ message: 'Startup failure' }),
    icon: CircleX,
  },
} as const

export function ActionRunStatus({
  status,
  conclusion,
}: {
  status: string
  conclusion?: string | null
}) {
  const { t: _t, i18n: _i18n } = useUiMessages()

  const value = conclusion ?? status
  const presentation = Object.hasOwn(statuses, value)
    ? statuses[value as keyof typeof statuses]
    : { label: _t({ message: 'Unknown' }), icon: CircleAlert }
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
      <HugeiconsIcon
        icon={Icon}
        aria-hidden="true"
        className={value === 'in_progress' ? 'animate-spin' : undefined}
        data-icon="inline-start"
      />
      {typeof presentation.label === 'string'
        ? presentation.label
        : _i18n._(presentation.label)}
    </Badge>
  )
}
