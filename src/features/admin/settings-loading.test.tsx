import { TestI18n } from '#/i18n/test-provider'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ActionsSkeleton } from './actions-skeleton'
import { CacheSkeleton } from './cache-skeleton'
import { ConfigurationSkeleton } from './configuration-skeleton'
import { CollaboratorsSkeleton } from './collaborators-skeleton'

describe('Admin pages while loading', () => {
  it.each([
    [ConfigurationSkeleton, 'Loading configuration', 'Save'],
    [CollaboratorsSkeleton, 'Loading collaborators', 'Invite collaborator'],
    [ActionsSkeleton, 'Loading actions', 'Run'],
    [CacheSkeleton, 'Loading cache', 'Clear all'],
  ] as const)(
    'announces loading and disables mutations',
    (Component, label, action) => {
      const html = renderToStaticMarkup(<TestI18n>{<Component />}</TestI18n>)
      expect(html).toContain(`aria-label="${label}"`)
      expect(html).toContain('aria-busy="true"')
      expect(html).not.toContain('aria-label="Refreshing results"')
      expect(html).toMatch(
        new RegExp(
          `<button[^>]*disabled=""[^>]*>[\\s\\S]*?${action}[\\s\\S]*?</button>`,
        ),
      )
    },
  )
})
