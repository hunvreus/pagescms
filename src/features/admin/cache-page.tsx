import { useState } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'

import { OperationError } from '#/components/operation-error'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { updateCache } from '#/functions/cache'
import { queryKeys } from '#/queries/keys'
import { cacheStatusQueryOptions } from '#/queries/repository'

import { RepositoryAdminPage } from './repository-admin-page'

type CacheAction =
  | 'reconcile-content'
  | 'clear-content'
  | 'clear-permissions'
  | 'refresh-configuration'
  | 'clear-configuration'
  | 'clear-all'

type Confirmation = {
  action: CacheAction
  title: string
  description: string
  label: string
}

function date(value: string | undefined) {
  return value ? new Date(value).toLocaleString() : 'Never'
}

export function CachePage({
  owner,
  repo,
  branch,
}: {
  owner: string
  repo: string
  branch: string
}) {
  const params = { owner, repo, branch }
  const { data } = useSuspenseQuery(cacheStatusQueryOptions(params))
  const queryClient = useQueryClient()
  const [running, setRunning] = useState<CacheAction | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  async function run(action: CacheAction) {
    setRunning(action)
    setMessage(null)
    setError(null)
    try {
      const result = await updateCache({ data: { ...params, action } })
      setMessage(result.message)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.branch(params),
      })
    } catch (cause) {
      setError(cause)
    } finally {
      setRunning(null)
    }
  }

  const contentChecked = data.directories.reduce<string | undefined>(
    (latest, directory) =>
      !latest || directory.lastCheckedAt > latest
        ? directory.lastCheckedAt
        : latest,
    undefined,
  )

  return (
    <RepositoryAdminPage
      title="Cache"
      actions={
        <Button
          disabled={running !== null}
          variant="outline"
          onClick={() =>
            setConfirmation({
              action: 'clear-all',
              title: 'Clear all cached data?',
              description:
                'Content, configuration, and permission data will be fetched again when it is next needed.',
              label: 'Clear all',
            })
          }
        >
          <Trash2 />
          Clear cache
        </Button>
      }
    >
      <div>
        <p className="text-sm text-muted-foreground">
          Cached repository data reduces GitHub requests. GitHub remains the
          source of truth.
        </p>
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
        <OperationError error={error} fallback="Could not update the cache." />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table aria-label="Repository cache">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Cache</TableHead>
              <TableHead>Stored data</TableHead>
              <TableHead>Last checked</TableHead>
              <TableHead className="w-px text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <p className="font-medium">Content</p>
                <p className="max-w-md whitespace-normal text-xs text-muted-foreground">
                  Files and directory listings used by collections and media.
                </p>
              </TableCell>
              <TableCell>
                {data.fileCount} files · {data.directories.length} directories
              </TableCell>
              <TableCell>{date(contentChecked)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    aria-label="Refresh content cache"
                    disabled={running !== null}
                    size="icon-sm"
                    variant="outline"
                    onClick={() => void run('reconcile-content')}
                  >
                    {running === 'reconcile-content' ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}
                  </Button>
                  <Button
                    aria-label="Clear content cache"
                    disabled={running !== null}
                    size="icon-sm"
                    variant="outline"
                    onClick={() =>
                      setConfirmation({
                        action: 'clear-content',
                        title: 'Clear content cache?',
                        description:
                          'Collection and media data will be fetched again when it is next opened.',
                        label: 'Clear',
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>
                <p className="font-medium">Configuration</p>
                <p className="max-w-md whitespace-normal text-xs text-muted-foreground">
                  The validated .pages.yml snapshot used to build this
                  workspace.
                </p>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {data.configuration
                  ? `${data.configuration.sha.slice(0, 8)} · v${data.configuration.version}`
                  : 'Not cached'}
              </TableCell>
              <TableCell>{date(data.configuration?.lastCheckedAt)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <Button
                    aria-label="Refresh configuration cache"
                    disabled={running !== null}
                    size="icon-sm"
                    variant="outline"
                    onClick={() => void run('refresh-configuration')}
                  >
                    {running === 'refresh-configuration' ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}
                  </Button>
                  <Button
                    aria-label="Clear configuration cache"
                    disabled={running !== null}
                    size="icon-sm"
                    variant="outline"
                    onClick={() =>
                      setConfirmation({
                        action: 'clear-configuration',
                        title: 'Clear configuration cache?',
                        description:
                          'The repository configuration will be fetched and validated again on the next request.',
                        label: 'Clear',
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>
                <p className="font-medium">Permissions</p>
                <p className="max-w-md whitespace-normal text-xs text-muted-foreground">
                  Short-lived GitHub access checks for this repository.
                </p>
              </TableCell>
              <TableCell>{data.permissionCount} records</TableCell>
              <TableCell>—</TableCell>
              <TableCell className="text-right">
                <Button
                  aria-label="Clear permission cache"
                  disabled={running !== null}
                  size="icon-sm"
                  variant="outline"
                  onClick={() =>
                    setConfirmation({
                      action: 'clear-permissions',
                      title: 'Clear permission cache?',
                      description:
                        'GitHub permissions will be checked again on the next protected request.',
                      label: 'Clear',
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-medium">Cached directories</h2>
          <p className="text-sm text-muted-foreground">
            Directories appear after a collection or media folder has been
            opened.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <Table aria-label="Cached directories">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Path</TableHead>
                <TableHead>Used by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.directories.length ? (
                data.directories.map((directory) => (
                  <TableRow key={`${directory.context}:${directory.path}`}>
                    <TableCell className="font-mono text-xs">
                      {directory.path || '/'}
                    </TableCell>
                    <TableCell className="capitalize">
                      {directory.context}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          directory.status === 'error'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {directory.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{date(directory.lastCheckedAt)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    No directories cached.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => !open && setConfirmation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const action = confirmation?.action
                setConfirmation(null)
                if (action) void run(action)
              }}
            >
              {confirmation?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RepositoryAdminPage>
  )
}
