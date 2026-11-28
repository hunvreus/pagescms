import { cn } from 'cn'

export const settingsRowClassName =
  'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 *:self-center sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'

export const stackedSettingsRowClassName = cn(
  settingsRowClassName,
  'grid-cols-1',
)
