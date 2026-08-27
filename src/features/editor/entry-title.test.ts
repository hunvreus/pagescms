import { describe, expect, it } from 'vitest'

import { getEntryDisplayTitle } from './entry-title'

describe('getEntryDisplayTitle', () => {
  it('uses the configured primary field for an existing structured entry', () => {
    expect(
      getEntryDisplayTitle({
        content: { metadata: { title: 'Hello world' } },
        filename: 'hello.md',
        primaryField: 'metadata.title',
      }),
    ).toBe('Editing "Hello world"')
  })

  it('falls back to the filename when the primary value is empty', () => {
    expect(
      getEntryDisplayTitle({
        content: { title: '' },
        filename: 'hello.md',
        primaryField: 'title',
      }),
    ).toBe('Editing "hello.md"')
  })

  it('labels creation without pretending a file already exists', () => {
    expect(getEntryDisplayTitle({ creating: true, filename: '' })).toBe(
      'New entry',
    )
  })
})
