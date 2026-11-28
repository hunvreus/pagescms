import { describe, expect, it } from 'vitest'

import {
  parseAccountDeletion,
  parseProfileMutation,
} from '#/shared/requests/account'
import { parseProfileRequest } from '#/lib/profile'

describe('account requests', () => {
  it('ignores obsolete picture restoration inputs and still rejects remote images', () => {
    expect(
      parseProfileMutation({
        accountId: 'first',
        name: 'Ada',
        imageRestoreToken: 'receipt',
      }),
    ).toEqual({ accountId: 'first', name: 'Ada' })
    expect(() =>
      parseProfileMutation({
        accountId: 'first',
        name: 'Ada',
        image: 'https://example.com/picture.png',
        imageRestoreToken: 'receipt',
      }),
    ).toThrow()
  })
  it('requires an account and email confirmation for self-deletion', () => {
    expect(
      parseAccountDeletion({
        accountId: 'first',
        email: '  ADA@Example.com ',
        userId: 'other',
      }),
    ).toEqual({ accountId: 'first', email: 'ada@example.com' })
    for (const value of [
      null,
      {},
      { accountId: 'first' },
      { accountId: '', email: 'a@example.com' },
    ])
      expect(() => parseAccountDeletion(value)).toThrow()
  })
  it('requires an account identifier and ignores user-supplied completion markers', () => {
    expect(() => parseProfileMutation({ name: 'Ada' })).toThrow(
      'account is missing',
    )
    expect(
      parseProfileMutation({
        accountId: 'first',
        name: 'Ada',
        onboardingCompletedAt: new Date(),
        userId: 'second',
      }),
    ).toEqual({ accountId: 'first', name: 'Ada' })
  })
  it('normalizes profile names and enforces their bounds', () => {
    expect(parseProfileRequest({ name: '  Ada Lovelace  ' })).toEqual({
      name: 'Ada Lovelace',
    })
    expect(() => parseProfileRequest({ name: '   ' })).toThrow(
      'between 1 and 120',
    )
    expect(() => parseProfileRequest({ name: 'a'.repeat(121) })).toThrow(
      'between 1 and 120',
    )
  })
  it('ignores hosted newsletter inputs when updating an OSS profile', () => {
    expect(parseProfileRequest({ name: 'Ada', productUpdates: true })).toEqual({
      name: 'Ada',
    })
  })
  it('accepts removing a picture, limits uploads, and rejects remote URLs and SVGs', () => {
    expect(parseProfileRequest({ name: 'Ada', image: null })).toEqual({
      name: 'Ada',
      image: null,
    })
    const png =
      'data:image/png;base64,' +
      btoa(String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10) + 'image')
    expect(parseProfileRequest({ name: 'Ada', image: png })).toEqual({
      name: 'Ada',
      image: png,
    })
    for (const image of [
      'https://example.com/picture.png',
      'data:image/svg+xml;base64,' + btoa('<svg/>'),
      'data:image/png;base64,' + btoa('Not a PNG'),
      'data:image/png;base64,' + 'A'.repeat(150_000),
    ])
      expect(() => parseProfileRequest({ name: 'Ada', image })).toThrow()
  })
})
