import { Trans as UiTrans } from '@lingui/react/macro'
import type { ComponentProps } from 'react'
import { Link, useCanGoBack, useRouter } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import ArrowLeft from '@hugeicons/core-free-icons/ArrowLeft02Icon'

export function SettingsBackLink({
  onNavigate,
  onClick,
  ...props
}: Omit<ComponentProps<'a'>, 'href'> & { onNavigate?: () => void }) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  return (
    <Link
      {...props}
      to="/"
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return
        onNavigate?.()
        // Router history starts at zero on direct or external arrivals.
        if (canGoBack) {
          event.preventDefault()
          router.history.back()
        }
      }}
    >
      <HugeiconsIcon icon={ArrowLeft} aria-hidden="true" />
      <span>
        <UiTrans>Back</UiTrans>
      </span>
    </Link>
  )
}
