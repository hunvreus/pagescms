import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { SearchInput } from '#/components/search-input'
import { OperationError } from '#/components/operation-error'
import { getCacheFiles } from '#/functions/cache'
import { queryKeys } from '#/queries/keys'

export function CacheFiles({
  owner,
  repo,
  branch,
}: {
  owner: string
  repo: string
  branch: string
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const params = { owner, repo, branch }
  const query = useQuery({
    queryKey: [...queryKeys.branch(params), 'cache-files', page, search],
    queryFn: async () => ({
      ...(await getCacheFiles({ data: { ...params, page, search } })),
      search,
    }),
    enabled: open,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mx-4 mb-4">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground"
          aria-label="Show cached files"
        >
          Cached files
          <ChevronDown className={`size-4 ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SearchInput
            className="h-7 text-[0.8rem]"
            aria-label="Filter cached files"
            placeholder="Filter cached files…"
            value={search}
            disabled={query.isPending}
            loading={
              query.isFetching &&
              query.data !== undefined &&
              query.data.search !== search
            }
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
          />
          <nav aria-label="Cached files pagination" className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!query.data?.hasMore || query.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </nav>
        </div>
        <OperationError
          error={query.error}
          fallback="Could not load cached files."
        />
        <div className="rounded-md border">
          <Table
            aria-label="Cached files"
            aria-busy={query.isPending}
            className="min-w-[34rem] table-fixed"
            containerClassName="scrollbar scrollbar-sm"
          >
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Path</TableHead>
                <TableHead className="w-24">File SHA</TableHead>
                <TableHead className="w-44 whitespace-normal">
                  Last change commit
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? (
                Array.from({ length: 5 }, (_, row) => (
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
              ) : query.data?.files.length ? (
                query.data.files.map((file) => (
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
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground"
                  >
                    No cached files.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
