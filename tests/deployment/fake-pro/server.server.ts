import { definePagesCmsServerDeployment } from '#/deployment/contracts/server.server'
import { DEPLOYMENT_API_VERSION } from '#/deployment/contracts/version'

import { SERVER_ONLY_SENTINEL } from './server-only-sentinel.server'

export default definePagesCmsServerDeployment({
  apiVersion: DEPLOYMENT_API_VERSION,
  create() {
    return {
      accessPolicy: {
        authorize: async () => ({
          allowed: true as const,
          grant: { policyVersion: SERVER_ONLY_SENTINEL },
        }),
      },
    }
  },
})
