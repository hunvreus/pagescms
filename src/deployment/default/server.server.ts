import { createResendEmailProvider } from '../builtins/resend-email.server'
import { definePagesCmsServerDeployment } from '../contracts/server.server'

export default definePagesCmsServerDeployment({
  apiVersion: 1,
  create(environment) {
    return {
      emailProvider: createResendEmailProvider(environment),
    }
  },
})
