import { definePagesCmsClientDeployment } from '#/deployment/contracts/client'

export const FAKE_CLIENT_SENTINEL = 'PAGESCMS_FAKE_CLIENT_DEPLOYMENT'

export default definePagesCmsClientDeployment({
  apiVersion: 1,
  fields: {
    'fake-pro-text': ({ value }) => (
      <output data-deployment-fixture={FAKE_CLIENT_SENTINEL}>
        {typeof value === 'string' ? value : ''}
      </output>
    ),
  },
})
