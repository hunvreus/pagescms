import { describe, expect, it } from 'vitest'

import { definePagesCmsClientDeployment } from './client'
import { DeploymentConfigurationError } from './version'

describe('client deployment contract', () => {
  it('accepts a configured field contribution', () => {
    const field = () => null
    const deployment = definePagesCmsClientDeployment({
      apiVersion: 1,
      fields: { color: field },
    })

    expect(deployment.fields?.color).toBe(field)
  })

  it('rejects an incompatible API version', () => {
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion: 2,
      }),
    ).toThrow(DeploymentConfigurationError)
  })
})
