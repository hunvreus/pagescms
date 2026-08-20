import { describe, expect, it } from 'vitest'

import {
  repositoryActions,
  resolveActionRef,
  schemaActions,
  validateActionInputs,
} from './actions'

describe('repository actions', () => {
  it('extracts actions and resolves current refs', () => {
    expect(
      repositoryActions({
        actions: [{ name: 'deploy', label: 'Deploy', workflow: 'deploy.yml' }],
      }),
    ).toHaveLength(1)
    expect(resolveActionRef('current', 'main')).toBe('main')
    expect(resolveActionRef('production', 'main')).toBe('production')
  })

  it('validates configured input types and options', () => {
    expect(
      validateActionInputs(
        [
          {
            name: 'environment',
            label: 'Environment',
            type: 'select',
            required: true,
            options: [{ label: 'Production', value: 'production' }],
          },
          {
            name: 'dryRun',
            label: 'Dry run',
            type: 'checkbox',
            default: false,
          },
        ],
        { environment: 'production' },
      ),
    ).toEqual({ environment: 'production', dryRun: false })
    expect(() =>
      validateActionInputs(
        [{ name: 'count', label: 'Count', type: 'number' }],
        { count: 'two' },
      ),
    ).toThrow('number')
  })

  it('selects schema actions by context scope', () => {
    const schema = {
      actions: [
        { name: 'file', label: 'File', workflow: 'file.yml' },
        {
          name: 'collection',
          label: 'Collection',
          workflow: 'collection.yml',
          scope: 'collection',
        },
        {
          name: 'entry',
          label: 'Entry',
          workflow: 'entry.yml',
          scope: 'entry',
        },
      ],
    }
    expect(schemaActions(schema).map((action) => action.name)).toEqual(['file'])
    expect(
      schemaActions(schema, 'collection').map((action) => action.name),
    ).toEqual(['collection'])
    expect(schemaActions(schema, 'entry').map((action) => action.name)).toEqual(
      ['entry'],
    )
  })
})
