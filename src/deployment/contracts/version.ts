export const DEPLOYMENT_API_VERSION = 5 as const

export class DeploymentConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeploymentConfigurationError'
  }
}
