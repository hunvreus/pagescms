import { describe, expect, it } from 'vitest'

import { RootError } from './components/root-error'
import { getRouter } from './router'

describe('router error handling', () => {
  it('uses the themed error component for every route', () => {
    expect(getRouter().options.defaultErrorComponent).toBe(RootError)
  })
})
