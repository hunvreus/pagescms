import { LoaderCircle, Search } from 'lucide-react'
import { Input } from '#/components/ui/input'
import { cn } from '#/lib/utils'
import type { ComponentProps } from 'react'

export function SearchInput({
  className,
  loading = false,
  ...props
}: ComponentProps<typeof Input> & { loading?: boolean }) {
  return (
    <label className="relative w-full sm:w-64">
      {loading ? (
        <LoaderCircle
          aria-label="Refreshing results"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      ) : (
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input {...props} className={cn('pl-9', className)} />
    </label>
  )
}
