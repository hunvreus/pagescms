import { describe, expect, it } from 'vitest'
import {
  collaboratorInviteFieldError,
  parseCollaboratorEmails,
} from './collaborator-invites'

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
      'Alice <alice@example.com',
      'Alice <alice@example.com> trailing',
      'alice@example.com, invalid <bob@>',
      '"Unclosed name <alice@example.com>',
    ]) {
      expect(() => parseCollaboratorEmails(input)).toThrow('valid email')
    }
  })
  it('requires at least one address', () => {
    expect(() => parseCollaboratorEmails(' , ; \n ')).toThrow('at least one')
  })
  it('accepts pasted mailbox names without using them as account identities', () => {
    expect(
      parseCollaboratorEmails(
        'Ronan Berder <Ronan@Example.com>, "Doe, Jane" <jane@example.com>; ronAN@example.com',
      ),
    ).toEqual(['ronan@example.com', 'jane@example.com'])
    expect(
      parseCollaboratorEmails(
        'alice@example.com Bob Smith <bob@example.com>\nCarol <carol@example.com>',
      ),
    ).toEqual(['alice@example.com', 'bob@example.com', 'carol@example.com'])
  })
  it('distinguishes recipient errors from service and permission failures', () => {
    expect(
      collaboratorInviteFieldError(
        new Error('alice@example.com is already a collaborator'),
      ),
    ).toContain('already a collaborator')
    expect(
      collaboratorInviteFieldError(
        new Error('Enter a valid email address for each person'),
      ),
    ).toContain('valid email')
    expect(
      collaboratorInviteFieldError(new Error('Permission denied')),
    ).toBeUndefined()
  })
})
