import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConfigurationSkeleton } from './configuration-skeleton'
import { CollaboratorsSkeleton } from './collaborators-skeleton'

describe('settings while loading', () => {
  it.each([
    [ConfigurationSkeleton, 'Loading configuration', 'Edit configuration'],
    [CollaboratorsSkeleton, 'Loading collaborators', 'Invite collaborator'],
  ] as const)(
    'announces loading and disables mutations',
    (Component, label, action) => {
      const html = renderToStaticMarkup(<Component />)
      expect(html).toContain(`aria-label="${label}"`)
      expect(html).toContain('aria-busy="true"')
      expect(html).toMatch(
        new RegExp(`<button[^>]*disabled=""[^>]*>[\\s\\S]*?${action}</button>`),
      )
    },
  )
})
