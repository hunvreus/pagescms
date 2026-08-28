import { describe, expect, it } from 'vitest'

import {
  confineMediaAssets,
  confineMediaDeliveryValues,
  partitionMediaDeliveryPaths,
} from './media-service.server'

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

  it('drops provider assets outside the requested immediate directory', () => {
    const asset = (path: string) => ({
      id: path,
      kind: 'file' as const,
      name: path.split('/').at(-1) ?? path,
      path,
      sha: 'sha',
      size: 1,
      contentType: 'image/png',
    })
    expect(
      confineMediaAssets(schema, 'public/images', [
        asset('public/images/hero.png'),
        asset('public/images/nested/child.png'),
        asset('private/secret.png'),
      ]).map((value) => value.path),
    ).toEqual(['public/images/hero.png'])
  })

  it('drops unsolicited and duplicate provider leases', () => {
    const lease = (path: string, url = `https://cdn.example/${path}`) => ({
      assetId: path,
      path,
      url,
      expiresAt: null,
      cacheKey: path,
    })
    expect(
      confineMediaDeliveryValues(
        schema,
        ['public/images/hero.png'],
        [
          lease('public/images/hero.png'),
          lease('public/images/hero.png', 'https://duplicate.example'),
          lease('private/secret.png'),
        ],
      ),
    ).toEqual([lease('public/images/hero.png')])
  })
})
