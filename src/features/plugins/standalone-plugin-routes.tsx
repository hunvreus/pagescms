import type { I18n } from '@lingui/core'
import { translateMessage } from '#/i18n/message'
import { createRoute, lazyRouteComponent } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import type { PluginPageContribution } from '#/plugins/client'
import { useRawSearch } from '#/lib/use-raw-search'
import { pageTitle } from '#/lib/page-title'

const StandalonePluginPage = lazyRouteComponent(
  () => import('./standalone-plugin-page'),
  'StandalonePluginPage',
)

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    standalonePluginPageNamespace?: boolean
  }
}

/** Register exact public page paths under dedicated top-level namespaces. */
export function attachStandalonePluginRoutes(
  root: AnyRoute,
  pages: Readonly<Record<string, PluginPageContribution>>,
) {
  const existing: Array<AnyRoute> = root.children ?? []
  const original = existing.filter(
    (route) => !route.options.staticData?.standalonePluginPageNamespace,
  )
  const groups = new Map<string, Array<[string, PluginPageContribution]>>()
  for (const entry of Object.entries(pages)) {
    const prefix = entry[1].path.split('/')[1]
    groups.set(prefix, [...(groups.get(prefix) ?? []), entry])
  }
  const added = [...groups].map(([prefix, entries]) => {
    if (
      original.some(
        (route) =>
          'path' in route.options &&
          typeof route.options.path === 'string' &&
          route.options.path.split('/').find(Boolean) === prefix,
      )
    )
      throw new Error(`Conflicting standalone page namespace ${prefix}`)
    const parent = createRoute({
      getParentRoute: () => root,
      path: prefix,
      staticData: { standalonePluginPageNamespace: true },
    })
    const children = entries.map(([key, page]) => {
      function StandalonePage() {
        return <StandalonePluginPage id={key} search={useRawSearch()} />
      }
      StandalonePage.preload = StandalonePluginPage.preload
      return createRoute({
        getParentRoute: () => parent,
        path: page.path.split('/').slice(2).join('/'),
        head: ({ matches }) =>
          pageTitle(
            translateMessage(
              (matches[0]?.context as { i18n?: I18n }).i18n,
              page.title,
            ),
          ),
        component: StandalonePage,
      })
    })
    return parent.addChildren(children)
  })
  root.addChildren([...original, ...added])
}
