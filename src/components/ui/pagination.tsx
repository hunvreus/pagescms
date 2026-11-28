import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import * as React from 'react'
import { cn } from 'cn'

import { Button } from '#/components/ui/button.tsx'
import ChevronLeftIcon from '@hugeicons/core-free-icons/ChevronLeftIcon'
import ChevronRightIcon from '@hugeicons/core-free-icons/ChevronRightIcon'
import MoreHorizontalIcon from '@hugeicons/core-free-icons/MoreHorizontalIcon'

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  const { t: _t } = useUiMessages()

  return (
    <nav
      role="navigation"
      aria-label={_t({ message: 'pagination' })}
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn('flex items-center gap-0.5', className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
  React.ComponentProps<'a'>

function PaginationLink({
  className,
  isActive,
  size = 'icon',
  ...props
}: PaginationLinkProps) {
  return (
    <Button
      asChild
      variant={isActive ? 'outline' : 'ghost'}
      size={size}
      className={cn(className)}
    >
      <a
        aria-current={isActive ? 'page' : undefined}
        data-slot="pagination-link"
        data-active={isActive}
        {...props}
      />
    </Button>
  )
}

function PaginationPrevious({
  className,
  text,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  const { t: _t } = useUiMessages()

  return (
    <PaginationLink
      aria-label={_t({ message: 'Go to previous page' })}
      size="default"
      className={cn('pl-1.5!', className)}
      {...props}
    >
      <HugeiconsIcon
        aria-hidden="true"
        icon={ChevronLeftIcon}
        data-icon="inline-start"
      />
      <span className="hidden sm:block">
        {text ?? _t({ message: 'Previous' })}
      </span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text,
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  const { t: _t } = useUiMessages()

  return (
    <PaginationLink
      aria-label={_t({ message: 'Go to next page' })}
      size="default"
      className={cn('pr-1.5!', className)}
      {...props}
    >
      <span className="hidden sm:block">{text ?? _t({ message: 'Next' })}</span>
      <HugeiconsIcon
        aria-hidden="true"
        icon={ChevronRightIcon}
        data-icon="inline-end"
      />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <HugeiconsIcon aria-hidden="true" icon={MoreHorizontalIcon} />
      <span className="sr-only">
        <UiTrans>More pages</UiTrans>
      </span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
