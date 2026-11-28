import { useLingui as useUiMessages } from '@lingui/react/macro'
import { Skeleton } from './ui/skeleton'

/** Neutral body for extensions that do not contribute their own loading view. */
export function SettingsLoading() {
  const { t: _t } = useUiMessages()

  return (
    <div
      role="status"
      aria-label={_t({ message: 'Loading settings' })}
      className="space-y-3"
    >
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-8 w-full" />
      ))}
    </div>
  )
}
