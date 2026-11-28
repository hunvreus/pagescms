import { useEffect, useState } from 'react'
import { AvatarFallback } from '#/components/ui/avatar'
import { avatarGradient } from '#/lib/avatar-gradient'

export function GradientAvatarFallback({
  identity,
  initials,
}: {
  identity: string
  initials: string
}) {
  const [generated, setGenerated] = useState<{
    identity: string
    background: string
  } | null>(null)

  useEffect(() => {
    let active = true
    void avatarGradient(identity).then(
      (background) => {
        if (active) setGenerated({ identity, background })
      },
      () => {
        // Initials remain usable if local gradient generation is unavailable.
      },
    )
    return () => {
      active = false
    }
  }, [identity])

  const background =
    generated?.identity === identity ? generated.background : undefined
  return (
    <AvatarFallback style={{ backgroundImage: background }}>
      <span className={background ? 'sr-only' : undefined}>{initials}</span>
    </AvatarFallback>
  )
}
