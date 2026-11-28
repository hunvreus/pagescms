import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  CLIENT_DEPLOYMENT_ALIAS,
  resolveApplicationAliases,
  resolveDeploymentEntries,
  SERVER_DEPLOYMENT_ALIAS,
} from './deployment.config.ts'

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
          PAGESCMS_DEPLOYMENT_CLIENT: 'extensions/client.tsx',
          PAGESCMS_DEPLOYMENT_SERVER: 'extensions/server.server.ts',
        },
        rootDirectory,
      ),
    ).toMatchObject({
      client: resolve(rootDirectory, 'extensions/client.tsx'),
      server: resolve(rootDirectory, 'extensions/server.server.ts'),
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

  it('provides the same explicit aliases to Vite and Vitest', () => {
    const entries = resolveDeploymentEntries({}, rootDirectory)

    expect(resolveApplicationAliases(entries, rootDirectory)).toEqual([
      {
        find: '#pagescms/configured-icons',
        replacement: expect.stringMatching(/\/dist\/esm$/),
      },
      { find: SERVER_DEPLOYMENT_ALIAS, replacement: entries.server },
      { find: CLIENT_DEPLOYMENT_ALIAS, replacement: entries.client },
      { find: /^#\//, replacement: `${resolve(rootDirectory, 'src')}/` },
      { find: /^@\//, replacement: `${resolve(rootDirectory, 'src')}/` },
    ])
  })
})
