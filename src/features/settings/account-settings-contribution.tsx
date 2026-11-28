import { useLingui as useUiMessages } from '@lingui/react/macro'
import { translateMessage } from '#/i18n/message'
import { SettingsLoading } from '#/components/settings-loading'
import { lazy, Suspense, useEffect } from 'react'
import { CatchBoundary } from '@tanstack/react-router'
import { LoadError } from '#/components/operation-error'
import type { ReactNode, ComponentType } from 'react'
import deployment from '#pagescms/deployment/client'

const contributions = deployment.accountSettings.map((section) => ({
  id: section.id,
  label: section.label,
  Loading: section.loading,
  Component: lazy(section.load),
}))

function AccountSection({ id, children }: { id: string; children: ReactNode }) {
  useEffect(() => {
    if (window.location.hash === `#${id}`)
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
  }, [id])
  return (
    <div id={id} className="scroll-mt-6">
      {children}
    </div>
  )
}

export function AccountSettingsContribution({
  accountId,
}: {
  accountId: string
}) {
  const { i18n, t } = useUiMessages()
  return contributions.map(({ id, label: message, Loading, Component }) => {
    const label = translateMessage(i18n, message)
    return (
      <AccountSection key={id} id={id}>
        <CatchBoundary
          getResetKey={() => `${accountId}:${id}`}
          errorComponent={({ error }) => (
            <section className="space-y-3">
              <h2 className="text-base font-medium">{label}</h2>
              <LoadError
                error={error}
                message={t`Could not load ${label}`}
                onRetry={() => window.location.reload()}
                retryLabel={t`Reload page`}
              />
            </section>
          )}
        >
          <Suspense
            fallback={<AccountSectionPending label={label} Loading={Loading} />}
          >
            <Component accountId={accountId} />
          </Suspense>
        </CatchBoundary>
      </AccountSection>
    )
  })
}

function AccountSectionPending({
  label,
  Loading,
}: {
  label: string
  Loading?: ComponentType
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-medium">{label}</h2>
      {Loading ? <Loading /> : <SettingsLoading />}
    </section>
  )
}
export function AccountSettingsLoading() {
  const { i18n } = useUiMessages()
  return contributions.map(({ id, label, Loading }) => (
    <AccountSection key={id} id={id}>
      <AccountSectionPending
        label={translateMessage(i18n, label)}
        Loading={Loading}
      />
    </AccountSection>
  ))
}
