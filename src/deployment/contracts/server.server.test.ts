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

  it('preserves a valid media provider resolver', () => {
    const mediaProviderResolver = {
      resolveStorage: () => null,
      resolveDelivery: () => null,
    }
    const deployment = definePagesCmsServerDeployment({
      apiVersion: DEPLOYMENT_API_VERSION,
      create: () => ({ mediaProviderResolver }),
    })

    expect(
      createPagesCmsServerServices(deployment, {}).mediaProviderResolver,
    ).toBe(mediaProviderResolver)
  })

  it('rejects an incomplete media provider resolver', () => {
    const deployment = definePagesCmsServerDeployment({
      apiVersion: DEPLOYMENT_API_VERSION,
      create: (() => ({
        mediaProviderResolver: { resolveStorage: () => null },
      })) as never,
    })

    expect(() => createPagesCmsServerServices(deployment, {})).toThrow(
      /invalid media provider resolver/,
    )
  })

  it('preserves each hosted service boundary', () => {
    const services = {
      billingWebhook: { handle: async () => undefined },
      entitlementReader: { read: async () => null },
      repositoryPermissionAdmin: {
        read: async () => ({ version: '1', grants: [] }),
        replace: async () => ({ version: '2', grants: [] }),
      },
    }
    const deployment = definePagesCmsServerDeployment({
      apiVersion: DEPLOYMENT_API_VERSION,
      create: () => services,
    })

    expect(createPagesCmsServerServices(deployment, {})).toMatchObject(services)
  })

  it('rejects unknown deployment and service keys', () => {
    expect(() =>
      definePagesCmsServerDeployment({
        apiVersion: DEPLOYMENT_API_VERSION,
        create: () => ({}),
        hooks: [],
      } as never),
    ).toThrow(/unsupported key: hooks/)

    const deployment = definePagesCmsServerDeployment({
      apiVersion: DEPLOYMENT_API_VERSION,
      create: () => ({ hooks: [] }) as never,
    })
    expect(() => createPagesCmsServerServices(deployment, {})).toThrow(
      /unsupported key: hooks/,
    )
  })

  it('rejects incomplete hosted services', () => {
    for (const services of [
      { billingWebhook: {} },
      { entitlementReader: {} },
      { repositoryPermissionAdmin: { read: async () => ({}) } },
    ]) {
      const deployment = definePagesCmsServerDeployment({
        apiVersion: DEPLOYMENT_API_VERSION,
        create: () => services as never,
      })
      expect(() => createPagesCmsServerServices(deployment, {})).toThrow(
        /invalid/,
      )
    }
  })
})
