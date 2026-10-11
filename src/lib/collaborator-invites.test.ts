import { describe, expect, it } from 'vitest'
import { parseCollaboratorEmails } from './collaborator-invites'

describe('collaborator emails', () => {
  it('accepts a single address', () => {
    expect(parseCollaboratorEmails(' Alice@Example.com ')).toEqual([
      'alice@example.com',
    ])
  })
  it('accepts lists and deduplicates addresses case-insensitively', () => {
    expect(
      parseCollaboratorEmails(
        'alice@example.com, bob@example.com; ALICE@example.com\ncarol@example.com dan@example.com',
      ),
    ).toEqual([
      'alice@example.com',
      'bob@example.com',
      'carol@example.com',
      'dan@example.com',
    ])
  })
  it('rejects the entire list when any address is invalid', () => {
    for (const input of [
      'invalid',
      'alice@example.com, invalid',
      'alice@example.com bob@',
      'Alice <alice@example.com>',
    ]) {
      expect(() => parseCollaboratorEmails(input)).toThrow('valid email')
    }
  })
  it('requires at least one address', () => {
    expect(() => parseCollaboratorEmails(' , ; \n ')).toThrow('at least one')
  })
})
