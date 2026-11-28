import { Avatar, AvatarImage } from '#/components/ui/avatar'
import { GradientAvatarFallback } from '#/components/gradient-avatar-fallback'

export function CollaboratorIdentity({
  name,
  email,
  image,
}: {
  name?: string | null
  email: string
  image?: string | null
}) {
  const label = name || email
  const initials = label
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
  return (
    <div className="flex items-center gap-3">
      <Avatar aria-hidden="true">
        <AvatarImage src={image || undefined} alt="" />
        <GradientAvatarFallback identity={email} initials={initials} />
      </Avatar>
      <div className="min-w-0">
        {name ? <div className="font-medium">{name}</div> : null}
        <div className={name ? 'text-sm text-muted-foreground' : 'font-medium'}>
          {email}
        </div>
      </div>
    </div>
  )
}
