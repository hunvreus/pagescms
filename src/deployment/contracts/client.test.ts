import { describe, expect, it, vi } from 'vitest'
import { definePagesCmsClientDeployment } from './client'
import { DEPLOYMENT_API_VERSION } from './version'

const apiVersion = DEPLOYMENT_API_VERSION

describe('client plugin composition', () => {
  it('registers a lazy configuration editor action without loading it', () => {
    const load = vi.fn(async () => ({ default: () => null }))
    const deployment = definePagesCmsClientDeployment({
      apiVersion,
      plugins: [{ id: 'assistant', ui: { configurationEditor: load } }],
    })
    expect(deployment.ui.configurationEditor).toBe(load)
    expect(load).not.toHaveBeenCalled()
  })
  it('keeps pure definitions available without loading editor or view modules', () => {
    const editor = vi.fn(async () => ({ default: () => null }))
    const view = vi.fn(async () => ({ default: () => null }))
    const page = async () => ({ default: () => null })
    const read = vi.fn((value) => value)
    const deployment = definePagesCmsClientDeployment({
      apiVersion,
      plugins: [
        {
          id: 'example',
          fields: {
            color: { definition: { defaultValue: '#000', read }, editor, view },
          },
          ui: { repositoryCollaborators: page },
        },
      ],
    })
    expect(deployment.fields.color.definition.read).toBe(read)
    expect(deployment.fields.color.editor).toBe(editor)
    expect(deployment.ui.repositoryCollaborators).toBe(page)
    expect(Object.isFrozen(deployment.fields)).toBe(true)
    expect(editor).not.toHaveBeenCalled()
    expect(view).not.toHaveBeenCalled()
  })
  it('requires an explicit override for a built-in field', () => {
    const field = { definition: { defaultValue: 'custom' } }
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion,
        plugins: [{ id: 'a', fields: { text: field } }],
      }),
    ).toThrow('override: true')
    expect(
      definePagesCmsClientDeployment({
        apiVersion,
        plugins: [{ id: 'a', fields: { text: { ...field, override: true } } }],
      }).fields.text.definition.defaultValue,
    ).toBe('custom')
  })
  it('rejects duplicate field registrations and occupied UI slots', () => {
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion,
        plugins: [
          { id: 'a', fields: { color: { definition: {} } } },
          { id: 'b', fields: { color: { definition: {} } } },
        ],
      }),
    ).toThrow('Duplicate field color')
    const ui = { repositorySidebar: async () => ({ default: () => null }) }
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion,
        plugins: [
          { id: 'a', ui },
          { id: 'b', ui },
        ],
      }),
    ).toThrow('Duplicate UI')
  })
  it('composes account sections in navigation order', () => {
    const first = {
      id: 'first',
      label: 'First',
      loading: () => null,
      icon: () => null,
      order: 20,
      load: async () => ({ default: () => null }),
    }
    const second = {
      id: 'second',
      label: 'Second',
      order: 10,
      load: async () => ({ default: () => null }),
    }
    const deployment = definePagesCmsClientDeployment({
      apiVersion,
      plugins: [
        { id: 'a', ui: { accountSettings: [first] } },
        { id: 'b' },
        { id: 'c', ui: { accountSettings: [second] } },
      ],
    })
    expect(deployment.accountSettings).toEqual([second, first])
    expect('accountSettings' in deployment.ui).toBe(false)
  })
  it('rejects duplicate, reserved and malformed account section IDs', () => {
    const page = {
      id: 'custom',
      label: 'Custom',
      load: async () => ({ default: () => null }),
    }
    for (const pages of [
      [page, page],
      [{ ...page, id: 'profile' }],
      [{ ...page, id: '../custom' }],
      [{ ...page, loading: 'invalid' as never }],
    ]) {
      expect(() =>
        definePagesCmsClientDeployment({
          apiVersion,
          plugins: [{ id: 'a', ui: { accountSettings: pages } }],
        }),
      ).toThrow()
    }
  })
  it('registers standalone plugin pages by plugin-qualified key', () => {
    const load = async () => ({ default: () => null })
    const deployment = definePagesCmsClientDeployment({
      apiVersion,
      plugins: [
        {
          id: 'a',
          pages: {
            consent: { path: '/connect/consent', title: 'Consent', load },
          },
        },
      ],
    })
    expect(deployment.pages['a/consent'].title).toBe('Consent')
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion,
        plugins: [
          {
            id: 'a',
            pages: { Bad: { path: '/connect/consent', title: 'X', load } },
          },
        ],
      }),
    ).toThrow('Invalid page Bad')
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion,
        plugins: [
          {
            id: 'a',
            pages: { ok: { path: '/connect/consent', title: '', load } },
          },
        ],
      }),
    ).toThrow('Invalid page ok')
  })
  it('rejects reserved, malformed, duplicate and overlapping standalone paths', () => {
    const load = async () => ({ default: () => null })
    const page = (path: string) => ({ path, title: 'Page', load })
    for (const path of [
      '/github/plans',
      '/teams/new',
      '/settings/profile',
      '/api/test',
      '/auth/callback',
      '/sign-in/continue',
      '/invite/token',
      '/',
      '/connect',
      '/connect/../admin',
      '/connect/consent?x=1',
      '/connect/consent/',
    ]) {
      expect(() =>
        definePagesCmsClientDeployment({
          apiVersion,
          plugins: [{ id: 'a', pages: { one: page(path) } }],
        }),
      ).toThrow()
    }
    for (const path of ['/connect/consent', '/connect/consent/nested']) {
      expect(() =>
        definePagesCmsClientDeployment({
          apiVersion,
          plugins: [
            { id: 'a', pages: { one: page('/connect/consent') } },
            { id: 'b', pages: { two: page(path) } },
          ],
        }),
      ).toThrow('Conflicting standalone page path')
    }
  })
  it.each([
    { apiVersion: apiVersion + 1 },
    { apiVersion, fieldEditors: {} },
    {
      apiVersion,
      plugins: [
        { id: 'a', fields: { color: { definition: {}, editor: 'eager' } } },
      ],
    },
    {
      apiVersion,
      plugins: [
        { id: 'a', fields: { color: { definition: { write: 'invalid' } } } },
      ],
    },
    { apiVersion, plugins: [{ id: 'a', ui: { arbitrarySlot: () => null } }] },
  ])('rejects incompatible or invalid contributions', (input) => {
    expect(() => definePagesCmsClientDeployment(input as never)).toThrow()
  })
})

it('namespaces lazy repository pages and validates their route names', () => {
  const load = vi.fn(async () => ({ default: () => null }))
  const deployment = definePagesCmsClientDeployment({
    apiVersion,
    plugins: [
      {
        id: 'example',
        repositoryPages: { settings: { label: 'Settings', load } },
        ui: { repositorySidebar: load },
      },
      {
        id: 'another',
        repositoryPages: {
          settings: { path: 'other-settings', label: 'Other settings', load },
        },
      },
    ],
  })
  expect(Object.keys(deployment.repositoryPages)).toEqual([
    'example/settings',
    'another/settings',
  ])
  expect(deployment.ui.repositorySidebar).toBe(load)
  expect(Object.isFrozen(deployment.repositoryPages)).toBe(true)
  expect(load).not.toHaveBeenCalled()
  for (const name of ['../settings', 'Settings', 'a/b']) {
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion,
        plugins: [
          {
            id: 'example',
            repositoryPages: { [name]: { label: 'Settings', load } },
          },
        ],
      }),
    ).toThrow()
  }
})

it('accepts lazy navigation badges and rejects non-function badges', () => {
  const load = async () => ({ default: () => null })
  const deployment = definePagesCmsClientDeployment({
    apiVersion,
    plugins: [
      {
        id: 'example',
        repositoryPages: {
          settings: { label: 'Settings', load, badge: load, navigation: load },
        },
      },
    ],
  })
  expect(deployment.repositoryPages['example/settings'].badge).toBe(load)
  expect(deployment.repositoryPages['example/settings'].navigation).toBe(load)
  expect(() =>
    definePagesCmsClientDeployment({
      apiVersion,
      plugins: [
        {
          id: 'example',
          repositoryPages: {
            settings: { label: 'Settings', load, badge: 'invalid' as never },
          },
        },
      ],
    }),
  ).toThrow('Invalid repository page')
})

it('accepts finite menu positions and rejects invalid ones', () => {
  const load = async () => ({ default: () => null })
  const create = (order: number) =>
    definePagesCmsClientDeployment({
      apiVersion,
      plugins: [
        {
          id: 'example',
          repositoryPages: { settings: { label: 'Settings', load, order } },
        },
      ],
    })
  expect(create(25).repositoryPages['example/settings'].order).toBe(25)
  for (const order of [NaN, Infinity, '25'])
    expect(() => create(order as number)).toThrow('Invalid repository page')
})

it('accepts plugin navigation icon components and rejects invalid icons', () => {
  const icon = () => null
  const load = async () => ({ default: () => null })
  const create = (value: typeof icon) =>
    definePagesCmsClientDeployment({
      apiVersion,
      plugins: [
        {
          id: 'example',
          repositoryPages: {
            settings: { label: 'Settings', load, icon: value },
          },
        },
      ],
    })
  expect(create(icon).repositoryPages['example/settings'].icon).toBe(icon)
  expect(() => create('settings' as never)).toThrow('Invalid repository page')
})

it('rejects plugin route collisions with core or another plugin before loading components', () => {
  const load = vi.fn(async () => ({ default: () => null }))
  for (const path of [
    'configuration',
    'collaborators',
    'actions',
    'cache',
    'collection',
    'file',
    'media',
    'extensions',
  ]) {
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion,
        plugins: [
          {
            id: 'example',
            repositoryPages: { custom: { path, label: 'Custom', load } },
          },
        ],
      }),
    ).toThrow(`Conflicting repository page path ${path}`)
  }
  expect(() =>
    definePagesCmsClientDeployment({
      apiVersion,
      plugins: [
        {
          id: 'first',
          repositoryPages: {
            settings: { path: 'shared', label: 'First', load },
          },
        },
        {
          id: 'second',
          repositoryPages: {
            different: { path: 'shared', label: 'Second', load },
          },
        },
      ],
    }),
  ).toThrow('Conflicting repository page path shared')
  for (const path of [
    '../roles',
    '/roles',
    'Roles',
    'roles/extra',
    '',
    'roles?x=1',
  ]) {
    expect(() =>
      definePagesCmsClientDeployment({
        apiVersion,
        plugins: [
          {
            id: 'example',
            repositoryPages: { roles: { path, label: 'Roles', load } },
          },
        ],
      }),
    ).toThrow()
  }
  expect(load).not.toHaveBeenCalled()
})

it('preserves custom repository page loading components and validates them', () => {
  const load = async () => ({ default: () => null })
  const loading = () => null
  const deployment = definePagesCmsClientDeployment({
    apiVersion,
    plugins: [
      {
        id: 'example',
        repositoryPages: { settings: { label: 'Settings', load, loading } },
      },
    ],
  })
  expect(deployment.repositoryPages['example/settings'].loading).toBe(loading)
  expect(() =>
    definePagesCmsClientDeployment({
      apiVersion,
      plugins: [
        {
          id: 'example',
          repositoryPages: {
            settings: {
              label: 'Settings',
              load,
              // @ts-expect-error Invalid runtime contribution.
              loading: 'invalid',
            },
          },
        },
      ],
    }),
  ).toThrow()
})
