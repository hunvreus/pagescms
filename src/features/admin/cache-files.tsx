import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { Collapsible, CollapsibleContent } from '#/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableErrorRow,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { CacheFilesTrigger } from './cache-files-trigger'
import { SearchInput } from '#/components/search-input'
import { getCacheFiles } from '#/client/api/cache'
import { queryKeys } from '#/client/queries/keys'

export function CacheFiles({
  owner,
  repo,
  branch,
  repoId,
}: {
  owner: string
  repo: string
  branch: string
  repoId?: string
}) {
  const { t: _t } = useUiMessages()

  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(timeout)
  }, [search])
  const params = { owner, repo, branch, repoId }
  const query = useQuery({
    queryKey: [
      ...queryKeys.branch(params),
      'cache-files',
      page,
      debouncedSearch,
    ],
    queryFn: async () => ({
      ...(await getCacheFiles({ ...params, page, search: debouncedSearch })),
      search: debouncedSearch,
    }),
    enabled: open,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
  const previousData = useRef(query.data)
  useEffect(() => {
    if (query.data && !query.isPlaceholderData)
      previousData.current = query.data
  }, [query.data, query.isPlaceholderData])
  const data = query.data ?? (query.error ? previousData.current : undefined)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-4">
      <CacheFilesTrigger />
      <CollapsibleContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SearchInput
            aria-label={_t({ message: 'Filter cached files' })}
            placeholder={_t({ message: 'Filter cached files…' })}
            value={search}
            disabled={query.isPending}
            loading={
              query.data !== undefined &&
              (query.isFetching || debouncedSearch !== search) &&
              query.data.search !== search
            }
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
          />
          <nav
            aria-label={_t({ message: 'Cached files pagination' })}
            className="flex gap-2"
          >
            <Button
              variant="outline"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage(page - 1)}
            >
              <UiTrans>Previous</UiTrans>
            </Button>
            <Button
              variant="outline"
              disabled={!query.data?.hasMore || query.isFetching}
              onClick={() => setPage(page + 1)}
            >
              <UiTrans>Next</UiTrans>
            </Button>
          </nav>
        </div>
        <div className="rounded-xl border">
          <Table
            aria-label={_t({ message: 'Cached files' })}
            aria-busy={query.isFetching}
            className="min-w-[34rem] table-fixed"
            containerClassName="scrollbar scrollbar-sm"
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>
                  <UiTrans>Path</UiTrans>
                </TableHead>
                <TableHead className="w-32 whitespace-normal">
                  <UiTrans>File SHA</UiTrans>
                </TableHead>
                <TableHead className="w-44 whitespace-normal">
                  <UiTrans>Last change commit</UiTrans>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? (
                Array.from({ length: 10 }, (_, row) => (
                  <TableRow key={row} className="h-10 hover:bg-transparent">
                    <TableCell>
                      <Skeleton className="h-4 w-3/4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  </TableRow>
                ))
              ) : data?.files.length ? (
                data.files.map((file) => (
                  <TableRow
                    className="h-10"
                    key={`${file.context}:${file.path}`}
                  >
                    <TableCell>
                      <span className="block truncate" title={file.path}>
                        {file.path}
                      </span>
                    </TableCell>
                    <TableCell>
                      <code title={file.sha ?? undefined}>
                        {file.sha?.slice(0, 7) ?? '—'}
                      </code>
                    </TableCell>
                    <TableCell>
                      <code title={file.commitSha ?? undefined}>
                        {file.commitSha?.slice(0, 7) ?? '—'}
                      </code>
                    </TableCell>
                  </TableRow>
                ))
              ) : !query.error ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground"
                  >
                    <UiTrans>No cached files.</UiTrans>
                  </TableCell>
                </TableRow>
              ) : null}
              {query.error ? (
                <TableErrorRow
                  colSpan={3}
                  message={
                    data
                      ? _t({
                          message:
                            'Could not refresh cached files. The displayed results may be out of date.',
                        })
                      : _t({ message: 'Could not load cached files.' })
                  }
                  onRetry={() => void query.refetch()}
                  retrying={query.isFetching}
                />
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
