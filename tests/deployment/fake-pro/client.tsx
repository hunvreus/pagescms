import { definePagesCmsClientDeployment } from '#/deployment/contracts/client'
import { DEPLOYMENT_API_VERSION } from '#/deployment/contracts/version'

export const FAKE_CLIENT_SENTINEL = 'PAGESCMS_FAKE_CLIENT_DEPLOYMENT'

export default definePagesCmsClientDeployment({
  apiVersion: DEPLOYMENT_API_VERSION,
  fields: {
    'fake-pro-text': ({ value }) => (
      <output data-deployment-fixture={FAKE_CLIENT_SENTINEL}>
        {typeof value === 'string' ? value : ''}
      </output>
    ),
  },
})
