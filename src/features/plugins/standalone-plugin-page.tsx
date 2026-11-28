import { DocumentTitle } from '#/i18n/document-title'
import { lazy, Suspense } from 'react'
import deployment from '#pagescms/deployment/client'
import { SettingsLoading } from '#/components/settings-loading'

const pages = new Map(
  Object.entries(deployment.pages).map(([key, page]) => [
    key,
    { ...page, Component: lazy(page.load) },
  ]),
)

export function StandalonePluginPage({
  id,
  search,
}: {
  id: string
  search: string
}) {
  const entry = pages.get(id)
  if (!entry) return null
  const Loading = entry.loading ?? SettingsLoading
  return (
    <main className="mx-auto w-full max-w-2xl p-4 md:p-8">
      <DocumentTitle message={entry.title} />
      <Suspense fallback={<Loading />}>
        <entry.Component search={search} />
      </Suspense>
    </main>
  )
}
