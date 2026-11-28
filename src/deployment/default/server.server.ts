import { resendEmail } from '#/plugins/email/resend.server'
import { definePagesCmsServerDeployment } from '../contracts/server.server'
import { DEPLOYMENT_API_VERSION } from '../contracts/version'

export default definePagesCmsServerDeployment({
  apiVersion: DEPLOYMENT_API_VERSION,
  plugins: [resendEmail()],
})
