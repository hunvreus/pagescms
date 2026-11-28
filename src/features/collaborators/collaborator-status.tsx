import { useLingui as useUiMessages } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import CircleCheck from '@hugeicons/core-free-icons/CircleCheckIcon'
import Clock3 from '@hugeicons/core-free-icons/Clock01Icon'
import Mail from '@hugeicons/core-free-icons/Mail01Icon'
import { Badge } from '#/components/ui/badge'
import { collaboratorStatus } from '#/lib/collaborator-status'

export function CollaboratorStatus({
  active,
  expiresAt,
}: {
  active: boolean
  expiresAt?: Date | string | null
}) {
  const { t } = useUiMessages()
  const [now, setNow] = useState(Date.now)
  const expiry = expiresAt ? new Date(expiresAt).getTime() : 0
  useEffect(() => {
    if (active || !Number.isFinite(expiry) || expiry <= now) return
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(0, expiry - Date.now()), 2_147_483_647),
    )
    return () => window.clearTimeout(timer)
  }, [active, expiry, now])
  const status = collaboratorStatus(active, expiresAt, now)
  const Icon = active
    ? CircleCheck
    : status === 'Invitation expired'
      ? Clock3
      : Mail
  return (
    <Badge
      variant="secondary"
      className={!active ? 'text-muted-foreground' : undefined}
    >
      <HugeiconsIcon icon={Icon} aria-hidden="true" data-icon="inline-start" />
      {status === 'Active'
        ? t({ message: 'Active' })
        : status === 'Invitation expired'
          ? t({ message: 'Invitation expired' })
          : t({ message: 'Invitation pending' })}
    </Badge>
  )
}
