import { useLingui } from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import ArrowDown from '@hugeicons/core-free-icons/ArrowDown02Icon'
import ArrowUp from '@hugeicons/core-free-icons/ArrowUp02Icon'
import type { ReactNode, SyntheticEvent, ComponentProps } from 'react'
import { cn } from 'cn'
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { collectionFluidColumn } from './collection-model'
import type { CollectionViewModel } from './collection-model'

function secondaryWidth(type: string) {
  switch (type) {
    case 'image':
      return 4
    case 'boolean':
      return 7
    case 'date':
    case 'datetime':
      return 10
    default:
      return 12
  }
}

export function CollectionDataRow({
  layout,
  ...props
}: ComponentProps<typeof TableRow> & {
  layout: CollectionViewModel['layout']
}) {
  return (
    <TableRow
      className={
        layout === 'tree' ? 'h-[calc(3.5rem+1px)]' : 'h-[calc(2.75rem+1px)]'
      }
      {...props}
    />
  )
}

export function CollectionDataCell({
  type,
  ...props
}: ComponentProps<typeof TableCell> & { type?: string }) {
  return (
    <TableCell
      className={cn(
        'overflow-hidden',
        (type === 'actions' || type === 'image') && 'py-0',
      )}
      {...props}
    />
  )
}

export function CollectionTableLayout({
  model,
  sorting = model.initial.sorting,
  onSort,
  children,
}: {
  model: CollectionViewModel
  sorting?: ReadonlyArray<{ id: string; desc: boolean }>
  onSort?: (id: string, event: SyntheticEvent) => void
  children: ReactNode
}) {
  const { t } = useLingui()
  const fluid = collectionFluidColumn(model)
  const columns = model.columns.map((column) => ({
    id: column.path,
    label:
      column.systemLabel === 'date'
        ? t({ message: 'Date' })
        : column.systemLabel === 'name'
          ? t({ message: 'Name' })
          : column.label,
    type: column.type,
    width: column.path === fluid ? undefined : secondaryWidth(column.type),
    sortable: model.sortFields.includes(column.path),
  }))
  columns.push({
    id: 'actions',
    label: '',
    type: 'actions',
    width: 8,
    sortable: false,
  })
  const minWidth = columns.reduce((sum, col) => sum + (col.width ?? 12), 0)
  return (
    <Table
      className="table-fixed"
      containerClassName="rounded-xl border bg-card"
      style={{ minWidth: minWidth + 'rem' }}
    >
      <colgroup>
        {columns.map(({ id, width }) => (
          <col key={id} style={width ? { width: width + 'rem' } : undefined} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map(({ id, label, sortable }) => {
            const sort = sorting.find((column) => column.id === id)
            const interactive = sortable && onSort
            return (
              <TableHead
                key={id}
                className={cn(
                  'overflow-hidden',
                  interactive && 'cursor-pointer select-none hover:bg-muted/50',
                )}
                aria-sort={
                  sort
                    ? sort.desc
                      ? 'descending'
                      : 'ascending'
                    : sortable
                      ? 'none'
                      : undefined
                }
                tabIndex={interactive ? 0 : undefined}
                onClick={interactive ? (event) => onSort(id, event) : undefined}
                onKeyDown={
                  interactive
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onSort(id, event)
                        }
                      }
                    : undefined
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{label}</span>
                  {sortable && (
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={sort && !sort.desc ? ArrowUp : ArrowDown}
                      className={cn('size-4 shrink-0', !sort && 'opacity-0')}
                    />
                  )}
                </span>
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      {children}
    </Table>
  )
}
