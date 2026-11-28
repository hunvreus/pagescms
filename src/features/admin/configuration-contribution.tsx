import { CatchBoundary } from '@tanstack/react-router'
import { lazy } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import deployment from '#pagescms/deployment/client'
import { authenticationQueryOptions } from '#/client/queries/session'
import type { ConfigurationEditorContributionProps } from '#/plugins/client'

const Contribution = deployment.ui.configurationEditor
  ? lazy(deployment.ui.configurationEditor)
  : null

export async function preloadConfigurationContribution() {
  await deployment.ui.configurationEditor?.()
}

type Props = Omit<ConfigurationEditorContributionProps, 'accountId'>

export function ConfigurationContribution(props: Props) {
  if (!Contribution) return props.setup
  return (
    <CatchBoundary
      getResetKey={() => `${props.owner}/${props.repo}:${props.branch}`}
      errorComponent={() => props.setup}
      onCatch={(error) =>
        console.warn({ event: 'configuration_contribution_failed', error })
      }
    >
      <AuthenticatedContribution {...props} />
    </CatchBoundary>
  )
}

function AuthenticatedContribution(props: Props) {
  const { data } = useSuspenseQuery(authenticationQueryOptions())
  return Contribution && data.user ? (
    <Contribution
      key={`${data.user.id}:${props.owner}/${props.repo}:${props.branch}`}
      {...props}
      accountId={data.user.id}
    />
  ) : (
    props.setup
  )
}
