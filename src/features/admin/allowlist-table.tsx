import { Trans as UiTrans, useLingui } from '@lingui/react/macro'
import type { getSignInAllowlist } from '#/client/api/admin'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableErrorRow,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'

type Rule = Awaited<ReturnType<typeof getSignInAllowlist>>['rules'][number]

export function AllowlistTable({
  rules,
  query = '',
  loading = false,
  error = false,
  errorMessage,
  onRetry,
  onRemove,
}: {
  rules?: Rule[]
  query?: string
  loading?: boolean
  error?: boolean
  errorMessage?: string
  onRetry?: () => void
  onRemove?: (rule: Rule) => void
}) {
  const { t } = useLingui()
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table
        aria-label={t`Sign-in access`}
        aria-busy={loading}
        className="table-fixed"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-28">
              <UiTrans>Type</UiTrans>
            </TableHead>
            <TableHead>
              <UiTrans>Rule</UiTrans>
            </TableHead>
            <TableHead className="w-24">
              <span className="sr-only">
                <UiTrans>Actions</UiTrans>
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules?.map((rule) => (
            <TableRow key={rule.id}>
              <TableCell>
                {rule.type === 'email'
                  ? t`Email`
                  : rule.type === 'domain'
                    ? t`Domain`
                    : t`Pattern`}
              </TableCell>
              <TableCell className="max-w-0 w-full truncate" title={rule.value}>
                {rule.value}
              </TableCell>
              <TableCell className="py-0 text-right">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!onRemove}
                  onClick={() => onRemove?.(rule)}
                >
                  <UiTrans>Remove</UiTrans>
                  <span className="sr-only"> {rule.value}</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!rules && loading
            ? [0, 1, 2].map((row) => (
                <TableRow
                  key={row}
                  aria-hidden="true"
                  className="hover:bg-transparent"
                >
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell className="w-full">
                    <Skeleton className="h-5 w-40 max-w-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-7 w-16" />
                  </TableCell>
                </TableRow>
              ))
            : null}
          {error && onRetry ? (
            <TableErrorRow
              colSpan={3}
              message={errorMessage ?? t`Could not load sign-in rules.`}
              onRetry={onRetry}
              retrying={loading}
            />
          ) : rules && !rules.length && !error ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={3}
                className="text-center text-muted-foreground"
              >
                {query
                  ? t`No matching sign-in rules.`
                  : t`No sign-in restrictions.`}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}
