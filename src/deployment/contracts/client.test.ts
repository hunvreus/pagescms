import { describe, expect, it } from 'vitest'

import { definePagesCmsClientDeployment } from './client'
import { DEPLOYMENT_API_VERSION, DeploymentConfigurationError } from './version'

describe('client deployment contract', () => {
  it('accepts lazy field and named UI contributions', () => {
    const field = async () => ({ default: () => null })
    const repositoryPermissions = async () => ({ default: () => null })
    const deployment = definePagesCmsClientDeployment({
      apiVersion: DEPLOYMENT_API_VERSION,
      fieldEditors: { color: field },
      ui: { repositoryPermissions },
    })

    expect(deployment.fieldEditors?.color).toBe(field)
    expect(deployment.ui?.repositoryPermissions).toBe(repositoryPermissions)
    expect(Object.isFrozen(deployment.fieldEditors)).toBe(true)
    expect(Object.isFrozen(deployment.ui)).toBe(true)
  })

  it('rejects an incompatible API version', () => {
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion: DEPLOYMENT_API_VERSION + 1,
      }),
    ).toThrow(DeploymentConfigurationError)
  })

  it('rejects eager and unknown contributions', () => {
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion: DEPLOYMENT_API_VERSION,
        fieldEditors: { color: 'eager' },
      } as never),
    ).toThrow(/invalid field color/)

    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion: DEPLOYMENT_API_VERSION,
        arbitrarySlot: () => null,
      } as never),
    ).toThrow(/unsupported key: arbitrarySlot/)

    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion: DEPLOYMENT_API_VERSION,
        ui: { arbitrarySlot: () => null },
      } as never),
    ).toThrow(/unsupported key: arbitrarySlot/)
  })
})
