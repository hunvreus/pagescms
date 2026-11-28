import { useEffect, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { componentLoader } from './component-loader'

/**
 * Load client components without Suspense retry delays.
 * Load optional client components after the initial render.
 */
export function deferredComponent<TProps extends object>(
  load: () => Promise<{ default: ComponentType<TProps> }>,
  fallback: (props: TProps) => ReactNode = () => null,
) {
  let loaded: ComponentType<TProps> | undefined
  const resolve = componentLoader(async () => {
    loaded = (await load()).default
    return loaded
  })

  return function DeferredComponent(props: TProps) {
    const [Component, setComponent] = useState(() => loaded)
    const [failure, setFailure] = useState<{ error: unknown }>()
    useEffect(() => {
      if (Component) return
      let active = true
      void resolve().then(
        (component) => {
          if (active) setComponent(() => component)
        },
        (error: unknown) => {
          if (active) setFailure({ error })
        },
      )
      return () => {
        active = false
      }
    }, [Component])

    // Keep import failures visible to the existing route error boundary.
    if (failure) throw failure.error
    return Component ? <Component {...props} /> : fallback(props)
  }
}
