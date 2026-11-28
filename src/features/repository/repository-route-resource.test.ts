import { expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { isNotFound } from '@tanstack/react-router'
import { requireRepositoryResource } from './repository-route-resource'

vi.mock('#/client/queries/repository', () => ({
  repositoryQueryOptions: () => ({ queryKey: ['workspace'] }),
}))
const params = { owner: 'o', repo: 'r', branch: 'main', name: 'posts' }
it('distinguishes absent and wrong-kind resources without another API request', () => {
  const client = new QueryClient()
  client.setQueryData(['workspace'], {
    configuration: {
      object: {
        content: [{ name: 'posts', type: 'collection', path: 'posts' }],
        media: [{ name: 'images', input: 'images', output: '/images' }],
      },
    },
  })
  expect(() =>
    requireRepositoryResource(client, params, 'collection'),
  ).not.toThrow()
  expect(() =>
    requireRepositoryResource(client, { ...params, name: 'images' }, 'media'),
  ).not.toThrow()
  for (const [name, type] of [
    ['missing', 'collection'],
    ['posts', 'file'],
    ['missing', 'media'],
  ] as const) {
    let error: unknown
    try {
      requireRepositoryResource(client, { ...params, name }, type)
    } catch (cause) {
      error = cause
    }
    expect(isNotFound(error)).toBe(true)
  }
})
it('does not classify a missing workspace snapshot as a missing page', () => {
  expect(() =>
    requireRepositoryResource(new QueryClient(), params, 'file'),
  ).not.toThrow()
})
