import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ActionsEmpty } from './actions-empty'
import { ActionsSkeleton } from './actions-skeleton'
import { CacheSkeleton } from './cache-skeleton'
import { ConfigurationSkeleton } from './configuration-skeleton'
import { CollaboratorsSkeleton } from './collaborators-skeleton'

describe('Admin pages while loading', () => {
  it('keeps the actions table and disabled header controls without configuration', () => {
    const html = renderToStaticMarkup(<ActionsEmpty />)
    expect(html).toContain('aria-label="Recent action runs"')
    for (const heading of ['Action', 'Status', 'Triggered by', 'Started']) {
      expect(html).toContain(`>${heading}</th>`)
    }
    expect(html).toContain('colSpan="5"')
    expect(html).toContain('No actions configured.')
    expect(html).toMatch(/<input[^>]*disabled=""/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Run/)
    expect(html).not.toContain('animate-spin')
  })
  it.each([
    [ConfigurationSkeleton, 'Loading configuration', 'Save'],
    [CollaboratorsSkeleton, 'Loading collaborators', 'Invite collaborator'],
    [ActionsSkeleton, 'Loading actions', 'Run'],
    [CacheSkeleton, 'Loading cache', 'Clear all'],
  ] as const)(
    'announces loading and disables mutations',
    (Component, label, action) => {
      const html = renderToStaticMarkup(<Component />)
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
