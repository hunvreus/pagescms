import { describe, expect, it } from 'vitest'

import { definePagesCmsClientDeployment } from './client'
import { DEPLOYMENT_API_VERSION, DeploymentConfigurationError } from './version'

describe('client deployment contract', () => {
  it('accepts a configured field contribution', () => {
    const field = () => null
    const deployment = definePagesCmsClientDeployment({
      apiVersion: DEPLOYMENT_API_VERSION,
      fields: { color: field },
    })

    expect(deployment.fields?.color).toBe(field)
  })

  it('rejects an incompatible API version', () => {
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion: DEPLOYMENT_API_VERSION + 1,
      }),
    ).toThrow(DeploymentConfigurationError)
  })
})
