import { useEffect } from 'react'
import { useLingui } from '@lingui/react'
import { useRouter } from '@tanstack/react-router'

type Meta = {
  title?: string
  name?: string
  property?: string
  content?: string
}

/** Re-evaluate pure head functions after activation, never route loaders. */
export function LocalizedRouteHead({
  description,
  imageAlt,
}: {
  description: string
  imageAlt: string
}) {
  const { i18n } = useLingui()
  const router = useRouter()
  useEffect(() => {
    document.documentElement.lang = i18n.locale
    let current = true
    const matches = router.state.matches
    void Promise.all(
      matches.map(async (match) => {
        // Route IDs and matches are paired here; the public union loses that correlation.
        const head = router.routesById[match.routeId].options.head as
          | undefined
          | ((context: {
              matches: typeof matches
              match: typeof match
              params: typeof match.params
              loaderData: typeof match.loaderData
            }) =>
              | { meta?: Array<Meta | undefined> }
              | Promise<{ meta?: Array<Meta | undefined> }>)
        const assets = await head?.({
          matches,
          match,
          params: match.params,
          loaderData: match.loaderData,
        })
        return assets?.meta ?? []
      }),
    )
      .then((titles) => {
        if (!current) return
        const metadata = titles
          .flat()
          .filter((meta): meta is Meta => Boolean(meta))
        const title = [...metadata].reverse().find((meta) => meta.title)?.title
        if (title) document.title = title
        // Translate the shell's existing preview tags without creating a second set.
        const localized: Meta[] = [
          { name: 'description', content: description },
          { property: 'og:description', content: description },
          { property: 'og:image:alt', content: imageAlt },
          { name: 'twitter:description', content: description },
        ]
        for (const meta of [...localized, ...metadata]) {
          const attribute = meta.name
            ? 'name'
            : meta.property
              ? 'property'
              : undefined
          if (!attribute || meta.content === undefined) continue
          for (const element of document.head.querySelectorAll('meta')) {
            if (element.getAttribute(attribute) === meta[attribute])
              element.content = meta.content
          }
        }
      })
      .catch((error) => console.warn('Could not refresh page title', error))
    return () => {
      current = false
    }
  }, [description, imageAlt, i18n.locale, router])
  return null
}
