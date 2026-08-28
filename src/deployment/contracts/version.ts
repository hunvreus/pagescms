// Wave 1 is an experimental composition spike, not a stable public API.
export const DEPLOYMENT_API_VERSION = 0 as const

export class DeploymentConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeploymentConfigurationError'
  }
}
