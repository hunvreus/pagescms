import { describe, expect, it } from 'vitest'

import {
  createPagesCmsServerServices,
  definePagesCmsServerDeployment,
} from './server.server'
import { DEPLOYMENT_API_VERSION, DeploymentConfigurationError } from './version'

describe('server deployment contract', () => {
  it('creates and validates deployment-scoped server services', () => {
    const accessPolicy = {
      authorize: async () => ({ allowed: true as const }),
    }
    const deployment = definePagesCmsServerDeployment({
      apiVersion: DEPLOYMENT_API_VERSION,
      create: () => ({ accessPolicy }),
    })

    expect(createPagesCmsServerServices(deployment, {}).accessPolicy).toBe(
      accessPolicy,
    )
  })

  it('rejects an incompatible API version', () => {
    expect(() =>
      definePagesCmsServerDeployment({
        apiVersion: DEPLOYMENT_API_VERSION + 1,
        create: () => ({}),
      }),
    ).toThrow(DeploymentConfigurationError)
  })

  it('rejects invalid services returned by the factory', () => {
    const deployment = definePagesCmsServerDeployment({
      apiVersion: DEPLOYMENT_API_VERSION,
      create: () => ({ accessPolicy: {} }) as never,
    })

    expect(() => createPagesCmsServerServices(deployment, {})).toThrow(
      /invalid access policy/,
    )
  })
})
