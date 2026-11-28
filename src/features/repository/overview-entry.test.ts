import { describe, expect, it } from 'vitest'
import {
  overviewBreadcrumbLabel,
  overviewEntryBreadcrumb,
  overviewParentLabel,
} from './overview-entry'
import type { EntrySummary } from '#/features/drafts/draft-store'

const entry: EntrySummary = {
  key: 'entry',
  account: 'user',
  source: 'github.com',
  title: 'Welcome',
  href: '/entry',
  updatedAt: 1,
  target: {
    owner: 'pagescms',
    repo: 'fixture',
    branch: 'main',
    name: 'posts',
    path: 'content/posts/hello.md',
  },
}
const configuration = {
  content: [
    {
      type: 'collection',
      name: 'posts',
      label: 'Posts',
      path: 'content/posts',
    },
    {
      type: 'group',
      name: 'team',
      label: 'Team',
      items: [
        {
          type: 'file',
          name: 'intro',
          label: 'Introduction',
          path: 'publications.json',
        },
      ],
    },
  ],
}
const resource = { type: 'collection' as const, name: 'posts', label: 'Posts' }

describe('overviewEntryBreadcrumb', () => {
  it('uses the collection label and primary title without repository path prefixes', () => {
    expect(overviewEntryBreadcrumb(entry, configuration, resource)).toEqual([
      { type: 'root', label: 'Posts' },
      { type: 'current', label: 'Welcome' },
    ])
  })
  it('collapses distant folders while retaining the full context for the tooltip', () => {
    const segments = overviewEntryBreadcrumb(
      {
        ...entry,
        target: {
          ...entry.target,
          path: 'content/posts/2026/campaigns/autumn/hello.md',
        },
      },
      configuration,
      resource,
    )
    expect(segments.map((segment) => segment.type)).toEqual([
      'root',
      'folder',
      'folder',
      'folder',
      'current',
    ])
    expect(overviewParentLabel(segments.slice(0, -1))).toBe(
      'Posts › … › autumn',
    )
    expect(overviewBreadcrumbLabel(segments)).toBe(
      'Posts › 2026 › campaigns › autumn › Welcome',
    )
  })
  it('uses the creation parent for new drafts', () => {
    expect(
      overviewBreadcrumbLabel(
        overviewEntryBreadcrumb(
          {
            ...entry,
            target: {
              ...entry.target,
              path: undefined,
              parent: 'content/posts/guides',
            },
          },
          configuration,
          resource,
        ),
      ),
    ).toBe('Posts › guides › Welcome')
  })
  it('uses configured labels for fixed files and retains their navigation context', () => {
    const fixed = {
      ...entry,
      title: 'publications.json',
      target: { ...entry.target, name: 'intro', path: 'publications.json' },
    }
    expect(
      overviewBreadcrumbLabel(
        overviewEntryBreadcrumb(fixed, configuration, {
          type: 'file',
          name: 'intro',
          label: 'Introduction',
        }),
      ),
    ).toBe('Team › Introduction')
  })
  it('keeps stale local records readable after a configured root changes', () => {
    expect(
      overviewEntryBreadcrumb(
        { ...entry, target: { ...entry.target, path: 'old/posts/hello.md' } },
        configuration,
        resource,
      ),
    ).toEqual([{ type: 'current', label: 'Welcome' }])
  })
  it('keeps configuration drafts identifiable and recoverable', () => {
    expect(
      overviewEntryBreadcrumb(
        {
          ...entry,
          target: {
            ...entry.target,
            name: 'configuration',
            kind: 'configuration',
          },
        },
        configuration,
      ),
    ).toEqual([{ type: 'current', label: 'Configuration' }])
  })
})
