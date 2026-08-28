import type { RepositoryPermissionsContributionProps } from '#/deployment/contracts/client'

import { FAKE_CLIENT_SENTINEL } from './client-sentinel'

export default function RepositoryPermissions({
  snapshot,
}: RepositoryPermissionsContributionProps) {
  return (
    <output data-deployment-fixture={FAKE_CLIENT_SENTINEL}>
      Permission version {snapshot.version}
    </output>
  )
}
