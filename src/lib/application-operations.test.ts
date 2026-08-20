import { describe, expect, it } from 'vitest'

import { APPLICATION_OPERATIONS } from './application-operations'

describe('application operation catalog', () => {
  it('contains stable unique identifiers for every legacy feature family', () => {
    expect(new Set(APPLICATION_OPERATIONS).size).toBe(
      APPLICATION_OPERATIONS.length,
    )
    expect(APPLICATION_OPERATIONS).toEqual(
      expect.arrayContaining([
        'repository.connect',
        'repository.read',
        'configuration.update',
        'configuration.history',
        'entry.create',
        'entry.update',
        'entry.delete',
        'media.write',
        'collaborator.invite',
        'action.run',
        'admin.access',
      ]),
    )
  })
})
