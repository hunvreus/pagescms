import { definePagesCmsClientDeployment } from '../contracts/client'
import { DEPLOYMENT_API_VERSION } from '../contracts/version'

export default definePagesCmsClientDeployment({
  apiVersion: DEPLOYMENT_API_VERSION,
})
