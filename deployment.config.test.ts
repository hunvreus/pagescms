import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveDeploymentEntries } from './deployment.config.ts'

const rootDirectory = '/workspace/pagescms'

describe('deployment entry resolution', () => {
  it('uses the public deployment by default', () => {
    expect(resolveDeploymentEntries({}, rootDirectory)).toMatchObject({
      client: resolve(rootDirectory, 'src/deployment/default/client.ts'),
      server: resolve(rootDirectory, 'src/deployment/default/server.server.ts'),
      selected: false,
    })
  })

  it('selects the server and client entries as one deployment', () => {
    expect(
      resolveDeploymentEntries(
        {
          PAGESCMS_DEPLOYMENT_CLIENT: 'tests/deployment/fake-pro/client.tsx',
          PAGESCMS_DEPLOYMENT_SERVER:
            'tests/deployment/fake-pro/server.server.ts',
        },
        rootDirectory,
      ),
    ).toMatchObject({
      client: resolve(rootDirectory, 'tests/deployment/fake-pro/client.tsx'),
      server: resolve(
        rootDirectory,
        'tests/deployment/fake-pro/server.server.ts',
      ),
      selected: true,
    })
  })

  it('rejects a partially selected deployment', () => {
    expect(() =>
      resolveDeploymentEntries(
        { PAGESCMS_DEPLOYMENT_CLIENT: './client.tsx' },
        rootDirectory,
      ),
    ).toThrow(/must be configured together/)
  })
})
