import { createResendEmailProvider } from '../builtins/resend-email.server'
import { definePagesCmsServerDeployment } from '../contracts/server.server'
import { DEPLOYMENT_API_VERSION } from '../contracts/version'

export default definePagesCmsServerDeployment({
  apiVersion: DEPLOYMENT_API_VERSION,
  create(environment) {
    return {
      emailProvider: createResendEmailProvider(environment),
    }
  },
})
