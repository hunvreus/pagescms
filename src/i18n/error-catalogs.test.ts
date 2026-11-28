import { expect, it, vi } from 'vitest'
import { loadErrorCatalogs } from './error-catalogs'
import type { ClientPlugin } from '#/plugins/client'

it('keeps optional diagnostics failures from blocking interface activation', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const plugins: ClientPlugin[] = [
      { id: 'broken', errors: () => Promise.reject(new Error('offline')) },
      {
        id: 'valid',
        errors: async () => [
          { source: 'A known error', message: { id: 'valid.error' } },
        ],
      },
    ]
    expect(await loadErrorCatalogs(plugins)).toEqual([
      { source: 'A known error', message: { id: 'valid.error' } },
    ])
    expect(warning).toHaveBeenCalledOnce()
  } finally {
    warning.mockRestore()
  }
})
it('rejects foreign diagnostic IDs without loading them into the shared registry', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    expect(
      await loadErrorCatalogs([
        {
          id: 'plugin',
          errors: async () => [
            { source: 'Error', message: { id: 'core.error' } },
          ],
        },
      ]),
    ).toEqual([])
  } finally {
    warning.mockRestore()
  }
})
