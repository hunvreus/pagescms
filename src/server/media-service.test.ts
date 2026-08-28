import { describe, expect, it } from 'vitest'

import { partitionMediaDeliveryPaths } from './media-service.server'

import type { MediaSchema } from '#/lib/configuration-content'

const schema = {
  name: 'images',
  input: 'public/images',
  output: 'public/images',
  extensions: ['png', 'jpg'],
} as MediaSchema

describe('media delivery path partitioning', () => {
  it('keeps valid paths while reporting invalid siblings independently', () => {
    expect(
      partitionMediaDeliveryPaths(schema, [
        'public/images/hero.png',
        'private/secret.png',
        'public/images/readme.txt',
        'public/images/hero.png',
      ]),
    ).toEqual({
      paths: ['public/images/hero.png'],
      errors: [
        {
          path: 'private/secret.png',
          message: 'Media path is outside its configured root',
        },
        {
          path: 'public/images/readme.txt',
          message: 'This file extension is not allowed',
        },
      ],
    })
  })
})
