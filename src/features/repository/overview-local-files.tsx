import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { useState } from 'react'
import type { ConfigurationNavigationItem } from '#/shared/configuration-navigation'
import { Button } from '#/components/ui/button'
import type { EntrySummary } from '#/features/drafts/draft-store'
import { OverviewFileItem } from './overview-file-item'
import { OverviewFilesSkeleton } from './overview-loading'

export function OverviewLocalFiles({
  resources,
  configuration,
  visits,
  drafts,
  loading,
  failed,
}: {
  resources: readonly ConfigurationNavigationItem[]
  configuration: Record<string, unknown>
  visits: EntrySummary[]
  drafts: EntrySummary[]
  loading: boolean
  failed: boolean
}) {
  const { t: _t } = useUiMessages()

  return (
    <div className="space-y-8">
      <section aria-label={_t({ message: 'Drafts' })} className="space-y-4">
        <h2 className="text-base font-medium">
          <UiTrans>Drafts</UiTrans>
        </h2>
        <FileList
          resources={resources}
          configuration={configuration}
          files={drafts}
          loading={loading}
          failed={failed}
          draft
        />
      </section>
      <section
        aria-label={_t({ message: 'Recently visited' })}
        className="space-y-4"
      >
        <h2 className="text-base font-medium">
          <UiTrans>Recently visited</UiTrans>
        </h2>
        <FileList
          resources={resources}
          configuration={configuration}
          files={visits.filter((entry) =>
            resources.some(
              (resource) =>
                resource.type !== 'media' &&
                resource.name === entry.target.name,
            ),
          )}
          loading={loading}
          failed={failed}
        />
      </section>
    </div>
  )
}

function FileList({
  resources,
  configuration,
  files,
  loading,
  failed,
  draft = false,
}: {
  resources: readonly ConfigurationNavigationItem[]
  configuration: Record<string, unknown>
  files: EntrySummary[]
  loading: boolean
  failed: boolean
  draft?: boolean
}) {
  const { t: _t } = useUiMessages()

  const [count, setCount] = useState(5)
  if (loading) return <OverviewFilesSkeleton draft={draft} />
  return (
    <div className="space-y-4">
      {files.length ? (
        <ul
          aria-label={
            draft
              ? _t({ message: 'Local drafts' })
              : _t({ message: 'Recently visited' })
          }
          className="divide-y border-t"
        >
          {files.slice(0, count).map((entry) => (
            <OverviewFileItem
              key={entry.key}
              entry={entry}
              configuration={configuration}
              resource={resources.find(
                (item) => item.name === entry.target.name,
              )}
              draft={draft}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {failed
            ? _t({ message: 'Could not load your entries.' })
            : draft
              ? _t({ message: 'No drafts saved on this device.' })
              : _t({ message: 'Entries you visit will appear here.' })}
        </p>
      )}
      {count < files.length ? (
        <div className="flex justify-start">
          <Button
            variant="secondary"
            size="sm"
            aria-label={
              draft
                ? _t({ message: 'Show more drafts' })
                : _t({ message: 'Show more recently visited entries' })
            }
            onClick={() => setCount((value) => value + 5)}
          >
            <UiTrans>Show more</UiTrans>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
