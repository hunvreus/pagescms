import { useLingui } from '@lingui/react/macro'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { cn } from 'cn'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

export type RepositoryCrumb = {
  label: string
  link?: ReactElement
  icon?: ReactElement
}

export function RepositoryBreadcrumb({
  items,
  title = true,
  keepParent = false,
}: {
  items: RepositoryCrumb[]
  title?: boolean
  keepParent?: boolean
}) {
  const { t } = useLingui()
  const viewport = useRef<HTMLDivElement>(null)
  const expanded = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  const lastHidden = items.length - (keepParent ? 3 : 2)
  const canCollapse = lastHidden >= 1

  useLayoutEffect(() => {
    const box = viewport.current
    const trail = expanded.current
    if (!box || !trail) return
    const measure = () =>
      setOverflow(
        trail.getBoundingClientRect().width > box.getBoundingClientRect().width,
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    observer.observe(trail)
    return () => observer.disconnect()
  }, [canCollapse])

  const collapsed = canCollapse && overflow
  return (
    <Breadcrumb className="min-w-0 flex-1">
      <div ref={viewport} className="relative min-w-0">
        {canCollapse && (
          <div
            aria-hidden="true"
            className="invisible pointer-events-none absolute inset-0 overflow-hidden"
          >
            <div
              ref={expanded}
              className={cn(
                'flex w-max items-center gap-1.5 whitespace-nowrap text-sm',
                title && 'text-lg font-medium',
              )}
            >
              {items.map((item, index) => (
                <Fragment key={index}>
                  {index > 0 && <span className="w-3.5" />}
                  {item.icon ?? (
                    <span
                      data-label={item.label}
                      className="before:content-[attr(data-label)]"
                    />
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        )}
        <BreadcrumbList
          className={cn(
            'flex-nowrap whitespace-nowrap',
            title && 'text-lg font-medium',
          )}
        >
          {items.map((item, index) => {
            const last = index === items.length - 1
            if (collapsed && index > 0 && index <= lastHidden) {
              if (index !== 1) return null
              return (
                <Fragment key="overflow">
                  <BreadcrumbSeparator className="shrink-0" />
                  <BreadcrumbItem className="shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={t({ message: 'Show hidden segments' })}
                        className="rounded-sm focus-visible:outline-ring"
                      >
                        <BreadcrumbEllipsis className="size-6" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="max-w-[calc(100vw-2rem)] [overflow-wrap:anywhere]"
                      >
                        {items.slice(1, lastHidden + 1).map((middle, i) =>
                          middle.link ? (
                            <DropdownMenuItem key={i} asChild>
                              {middle.link}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuLabel key={i}>
                              {middle.label}
                            </DropdownMenuLabel>
                          ),
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </BreadcrumbItem>
                </Fragment>
              )
            }
            return (
              <Fragment key={index}>
                {index > 0 && <BreadcrumbSeparator className="shrink-0" />}
                <BreadcrumbItem
                  className={cn(
                    'min-w-0',
                    collapsed && index === 0 && 'max-w-[38%]',
                  )}
                >
                  {last ? (
                    <BreadcrumbPage
                      title={item.label}
                      className={cn('block truncate', title && 'font-medium')}
                    >
                      {item.icon ?? item.label}
                      {item.icon && (
                        <span className="sr-only">{item.label}</span>
                      )}
                    </BreadcrumbPage>
                  ) : item.link ? (
                    <BreadcrumbLink
                      asChild
                      title={item.label}
                      className="block truncate"
                    >
                      {item.link}
                    </BreadcrumbLink>
                  ) : (
                    <span title={item.label} className="block truncate">
                      {item.label}
                    </span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            )
          })}
        </BreadcrumbList>
      </div>
    </Breadcrumb>
  )
}
