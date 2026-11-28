import { HugeiconsIcon } from '@hugeicons/react'
import { useSyncExternalStore } from 'react'
import { Toaster as Sonner } from 'sonner'
import type { ToasterProps } from 'sonner'
import CircleCheckIcon from '@hugeicons/core-free-icons/CircleCheckIcon'
import InfoIcon from '@hugeicons/core-free-icons/InfoIcon'
import TriangleAlertIcon from '@hugeicons/core-free-icons/Alert02Icon'
import OctagonXIcon from '@hugeicons/core-free-icons/OctagonXIcon'
import LoaderIcon from '@hugeicons/core-free-icons/LoaderIcon'

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
  return () => observer.disconnect()
}

const Toaster = ({ ...props }: ToasterProps) => {
  const dark = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.classList.contains('dark'),
    () => false,
  )
  const theme = dark ? 'dark' : 'light'

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: (
          <HugeiconsIcon
            aria-hidden="true"
            icon={CircleCheckIcon}
            className="size-4"
          />
        ),
        info: (
          <HugeiconsIcon
            aria-hidden="true"
            icon={InfoIcon}
            className="size-4"
          />
        ),
        warning: (
          <HugeiconsIcon
            aria-hidden="true"
            icon={TriangleAlertIcon}
            className="size-4"
          />
        ),
        error: (
          <HugeiconsIcon
            aria-hidden="true"
            icon={OctagonXIcon}
            className="size-4"
          />
        ),
        loading: (
          <HugeiconsIcon
            aria-hidden="true"
            icon={LoaderIcon}
            className="size-4 animate-spin"
          />
        ),
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'calc(var(--radius) * 1.4)',
          '--width': '24rem',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
