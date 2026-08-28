import type { DeploymentFieldProps } from '#/deployment/contracts/client'

import { FAKE_CLIENT_SENTINEL } from './client-sentinel'

export default function FakeField({ value }: DeploymentFieldProps) {
  return (
    <output data-deployment-fixture={FAKE_CLIENT_SENTINEL}>
      {typeof value === 'string' ? value : ''}
    </output>
  )
}
