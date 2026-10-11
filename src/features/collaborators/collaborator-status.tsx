import { CircleCheck, Mail } from 'lucide-react'
import { Badge } from '#/components/ui/badge'

export function CollaboratorStatus({ active }: { active: boolean }) {
  const Icon = active ? CircleCheck : Mail
  return (
    <Badge
      variant="secondary"
      className={!active ? 'text-muted-foreground' : undefined}
    >
      <Icon aria-hidden="true" />
      {active ? 'Active' : 'Invitation pending'}
    </Badge>
  )
}
