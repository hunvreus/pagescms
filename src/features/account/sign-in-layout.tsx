import { useLingui as useUiMessages } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { AboutDialog } from '#/features/dashboard/about-dialog'

export function SignInLayout({
  children,
  label,
}: {
  children: ReactNode
  label?: string
}) {
  const { t } = useUiMessages()
  return (
    <main
      className="relative flex min-h-svh items-center justify-center px-6 py-20"
      aria-label={label}
    >
      <div className="absolute top-0 left-0 flex h-12 items-center px-4">
        <AboutDialog />
      </div>
      <section
        aria-label={t`Sign in`}
        className="w-full max-w-[280px] space-y-6"
      >
        {children}
      </section>
    </main>
  )
}
