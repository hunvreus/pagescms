export const DEPLOYMENT_API_VERSION = 2 as const

export class DeploymentConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeploymentConfigurationError'
  }
}
