import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  preloadDestination,
  startComponentPreloading,
} from '#/lib/component-preloading'
import { preloadRepositoryPluginPage } from '#/features/admin/plugin-page'
import { preloadEditorComponents } from '#/features/editor/editor-component-loaders'

export default function ComponentPreloading() {
  const router = useRouter()
  useEffect(
    () =>
      startComponentPreloading((url, intent) =>
        preloadDestination(router, url, intent, {
          plugin: preloadRepositoryPluginPage,
          editor: preloadEditorComponents,
        }),
      ),
    [router],
  )
  return null
}
