import { useEffect, useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Check, LoaderCircle, Save } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import {
  getConfigurationEditor,
  updateConfiguration,
} from '#/functions/configuration-editor'
import { getSignInUrl } from '#/lib/auth-redirect'

export const Route = createFileRoute('/$owner/$repo/$branch/configuration')({
  loader: async ({ params }) => {
    try {
      return await getConfigurationEditor({ data: params })
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Authentication required'
      ) {
        throw redirect({
          href: getSignInUrl(
            `/${params.owner}/${params.repo}/${encodeURIComponent(params.branch)}/configuration`,
          ),
        })
      }
      throw error
    }
  },
  staleTime: 10_000,
  pendingMs: 100,
  pendingComponent: ConfigurationSkeleton,
  component: ConfigurationEditor,
})

function ConfigurationEditor() {
  const initial = Route.useLoaderData()
  const params = Route.useParams()
  const router = useRouter()
  const [source, setSource] = useState(initial.source)
  const [savedSource, setSavedSource] = useState(initial.source)
  const [sha, setSha] = useState<string | null>(initial.sha)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = source !== savedSource

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function save() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const result = await updateConfiguration({
        data: { ...params, source, sha },
      })
      setSha(result.sha)
      setSavedSource(source)
      setSaved(true)
      void router.invalidate()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save configuration',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">.pages.yml</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Configuration
          </h1>
        </div>
        <Button disabled={saving || !dirty} onClick={() => void save()}>
          {saving ? (
            <LoaderCircle className="animate-spin" />
          ) : saved ? (
            <Check />
          ) : (
            <Save />
          )}
          {saving ? 'Saving' : 'Save'}
        </Button>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Textarea
        aria-label="Pages CMS configuration"
        className="min-h-[calc(100vh-10rem)] resize-y bg-card font-mono text-[13px] leading-6"
        placeholder={'media: public/images\ncontent: []\n'}
        spellCheck={false}
        value={source}
        onChange={(event) => {
          setSource(event.target.value)
          setSaved(false)
        }}
      />
    </div>
  )
}

function ConfigurationSkeleton() {
  return (
    <div
      className="mx-auto max-w-5xl animate-pulse space-y-5"
      aria-label="Loading configuration"
    >
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-[70vh] rounded-xl border bg-card" />
    </div>
  )
}
