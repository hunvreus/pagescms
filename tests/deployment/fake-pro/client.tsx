import { definePagesCmsClientDeployment } from '#/deployment/contracts/client'
import { DEPLOYMENT_API_VERSION } from '#/deployment/contracts/version'

export { FAKE_CLIENT_SENTINEL } from './client-sentinel'

export default definePagesCmsClientDeployment({
  apiVersion: DEPLOYMENT_API_VERSION,
  fieldEditors: {
    'fake-pro-text': () => import('./fake-field'),
  },
  ui: {
    repositoryPermissions: () => import('./repository-permissions'),
  },
})
