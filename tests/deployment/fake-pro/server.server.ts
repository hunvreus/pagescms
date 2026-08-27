import { definePagesCmsServerDeployment } from '#/deployment/contracts/server.server'

import { SERVER_ONLY_SENTINEL } from './server-only-sentinel.server'

export default definePagesCmsServerDeployment({
  apiVersion: 1,
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
