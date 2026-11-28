import { Trans, useLingui } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import ChevronDown from '@hugeicons/core-free-icons/ChevronDownIcon'
import { CollapsibleTrigger } from '#/components/ui/collapsible'

export function CacheFilesTrigger() {
  const { t } = useLingui()
  return (
    <CollapsibleTrigger
      className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground data-[state=open]:[&>svg]:rotate-180"
      aria-label={t({ message: 'Show cached files' })}
    >
      <Trans>Cached files</Trans>
      <HugeiconsIcon aria-hidden="true" icon={ChevronDown} className="size-4" />
    </CollapsibleTrigger>
  )
}
