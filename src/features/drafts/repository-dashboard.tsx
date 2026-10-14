import { downloadDraft } from './draft-session'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { Plus, FileText, FileStack } from 'lucide-react'
import { ContentIcon } from '#/components/content-icon'
import { Button } from '#/components/ui/button'
import {
  RepositoryPageHeader,
  RepositoryPageTitle,
} from '#/components/repository-page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '#/components/ui/alert-dialog'
import { OperationError } from '#/components/operation-error'
import { authenticationQueryOptions } from '#/queries/session'
import { repositoryWorkspaceQueryOptions } from '#/queries/repository'
import { getConfigurationNavigation } from '#/lib/configuration-navigation'
import { discardDraft, listDrafts, recentEntries } from './draft-store'
import type { ListedDraft, EntrySummary } from './draft-store'

export function RepositoryDashboard({
  coordinates,
}: {
  coordinates: { owner: string; repo: string; branch: string }
}) {
  const router = useRouter()
  const { data: auth } = useQuery(authenticationQueryOptions())
  const { data: workspace } = useQuery(
    repositoryWorkspaceQueryOptions(coordinates),
  )
  const [drafts, setDrafts] = useState<ListedDraft[]>([])
  const [recent, setRecent] = useState<EntrySummary[]>([])
  const [error, setError] = useState<unknown>(null)
  const [discarding, setDiscarding] = useState<ListedDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const account = auth?.user?.id
  const key = JSON.stringify(coordinates)
  useEffect(() => {
    if (!account) return
    let cancelled = false
    const load = async () => {
      const [storedDrafts, entries] = await Promise.all([
        listDrafts(account, coordinates),
        recentEntries(account, coordinates, workspace?.source),
      ])
      if (!cancelled) {
        setDrafts(
          storedDrafts.filter(
            (draft) => draft.summary.source === workspace?.source,
          ),
        )
        setRecent(entries.filter((entry) => entry.source === workspace?.source))
      }
    }
    const refresh = () => {
      void load().catch((cause) => {
        if (!cancelled) setError(cause)
      })
    }
    refresh()
    window.addEventListener('pagescms:drafts', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('pagescms:drafts', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [account, key, workspace?.source])
  const content = workspace?.configuration
    ? getConfigurationNavigation(workspace.configuration.object).filter(
        (item) => item.type === 'collection' || item.type === 'file',
      )
    : []
  async function discard(draft: ListedDraft) {
    setBusy(true)
    setError(null)
    try {
      await discardDraft(draft.key, draft.revision)
      setDiscarding(null)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="-m-4 md:-m-6">
      <RepositoryPageHeader>
        <RepositoryPageTitle>Overview</RepositoryPageTitle>
      </RepositoryPageHeader>
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <OperationError
          error={error}
          fallback="Local drafts could not be loaded. Keep any open editor tabs until you can save."
        />
        {!workspace?.configuration ? (
          <div className="space-y-3">
            <h2 className="font-medium">Repository not configured</h2>
            <p className="text-sm text-muted-foreground">
              Add a .pages.yml file to start editing.
            </p>
            <Button asChild>
              <Link
                to="/$owner/$repo/$branch/configuration"
                params={coordinates}
              >
                Add configuration
              </Link>
            </Button>
          </div>
        ) : null}
        {drafts.length ? (
          <section className="space-y-3" aria-label="Local drafts">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Continue editing</h2>
              <span className="text-sm text-muted-foreground">
                Saved on this device
              </span>
            </div>
            <Table
              aria-label="Local drafts"
              containerClassName="rounded-xl border bg-card"
            >
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Entry</TableHead>
                  <TableHead>Collection</TableHead>
                  <TableHead>Last edited</TableHead>
                  <TableHead className="w-px">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((draft) => (
                  <TableRow key={draft.key}>
                    <TableCell>
                      <span className="font-medium">
                        {draft.summary.title || 'Untitled entry'}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {draft.summary.target.path
                          ? 'Unsaved changes'
                          : 'New entry'}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {draft.summary.target.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(draft.summary.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            void router.navigate({ href: draft.summary.href })
                          }
                        >
                          Resume
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => downloadDraft(draft)}
                        >
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDiscarding(draft)}
                        >
                          Discard
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ) : null}
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_15rem]">
          <section className="space-y-3">
            <h2 className="font-medium">Recently opened</h2>
            {recent.length ? (
              <Table
                aria-label="Recently opened"
                containerClassName="rounded-xl border bg-card"
              >
                <TableBody>
                  {recent.map((entry) => (
                    <TableRow key={entry.key}>
                      <TableCell className="font-medium">
                        {entry.title}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.target.name}
                      </TableCell>
                      <TableCell className="w-px text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void router.navigate({ href: entry.href })
                          }
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                Entries you open will appear here.
              </p>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="font-medium">Content shortcuts</h2>
            {content.length ? (
              <Table
                aria-label="Content shortcuts"
                containerClassName="rounded-xl border bg-card"
              >
                <TableBody>
                  {content.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell>
                        <Link
                          className="flex items-center gap-2"
                          to={
                            item.type === 'collection'
                              ? '/$owner/$repo/$branch/collection/$name/new'
                              : '/$owner/$repo/$branch/file/$name'
                          }
                          params={{ ...coordinates, name: item.name }}
                        >
                          <ContentIcon
                            name={item.icon}
                            fallback={
                              item.type === 'collection' ? FileStack : FileText
                            }
                            className="size-4"
                          />
                          <span className="flex-1">{item.label}</span>
                          {item.type === 'collection' ? (
                            <Plus
                              className="size-4"
                              aria-label="Create entry"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Edit
                            </span>
                          )}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                No content configured.
              </p>
            )}
          </section>
        </div>
      </div>
      <AlertDialog
        open={Boolean(discarding)}
        onOpenChange={(open) => {
          if (!open && !busy) setDiscarding(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard local draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Discard “{discarding?.summary.title}” from this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <OperationError
            error={error}
            fallback="Could not discard this draft."
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                if (discarding) void discard(discarding)
              }}
            >
              {busy ? 'Discarding…' : 'Discard draft'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
