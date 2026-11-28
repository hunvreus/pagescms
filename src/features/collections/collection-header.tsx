import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { SearchInput } from '#/components/search-input'
import FolderPlus from '@hugeicons/core-free-icons/FolderPlusIcon'
import Plus from '@hugeicons/core-free-icons/PlusIcon'
import Globe from '@hugeicons/core-free-icons/Globe02Icon'
import { RepositoryActionButtons } from '#/components/repository-action-buttons'
import { RepositoryPageHeader } from '#/components/repository-page-header'
import { Button } from '#/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import type { collectionPresentation } from '#/shared/collection-presentation'
import { Link } from '@tanstack/react-router'
import { Skeleton } from '#/components/ui/skeleton'
import type { ReactNode } from 'react'
import { RepositoryBreadcrumb } from '#/components/repository-breadcrumb'
import { getGitRelativePath, joinGitPath } from '#/shared/git-path'

type CollectionHeading = ReturnType<typeof collectionPresentation> & {
  path: string
  locale: string | null
}
type Coordinates = { owner: string; repo: string; branch: string; name: string }

export function CollectionLayout({
  children,
  pending,
}: {
  children: ReactNode
  pending?: boolean
}) {
  const { t } = useUiMessages()
  return (
    <div
      className="-mt-4 space-y-4 md:-mt-6 md:space-y-6"
      aria-busy={pending}
      aria-label={pending ? t({ message: 'Loading collection' }) : undefined}
    >
      {children}
    </div>
  )
}

export function CollectionHeader({
  collection,
  params,
  filter = '',
  locale,
  refreshing,
  createHref,
  onFilterChange,
  onNewFolder,
  onLocaleChange,
}: {
  collection?: CollectionHeading
  params?: Coordinates
  filter?: string
  locale?: string
  refreshing?: boolean
  createHref?: string
  onFilterChange?: (value: string) => void
  onNewFolder?: () => void
  onLocaleChange?: (value: string) => void
}) {
  const { t: _t } = useUiMessages()
  const pending = !onFilterChange
  const newEntry = (
    <>
      <HugeiconsIcon aria-hidden="true" icon={Plus} data-icon="inline-start" />
      <span className="hidden md:inline">
        <UiTrans>New entry</UiTrans>
      </span>
    </>
  )
  return (
    <RepositoryPageHeader
      stackToolbar
      className="-mx-4 md:-mx-6"
      toolbar={
        <SearchInput
          groupClassName="w-full"
          aria-label={_t({ message: 'Search collection' })}
          placeholder={_t({ message: 'Search entries…' })}
          value={filter}
          disabled={!onFilterChange}
          onChange={(event) => onFilterChange?.(event.target.value)}
        />
      }
      actions={
        <div className="flex min-w-0 items-center justify-end gap-1 md:flex-wrap md:gap-2">
          {collection?.i18n ? (
            <Select
              value={locale ?? collection.locale!}
              disabled={!onLocaleChange}
              onValueChange={onLocaleChange}
            >
              <SelectTrigger
                aria-label={_t({ message: 'Collection language' })}
                title={
                  collection.i18n.locales.find(
                    (item) => item.code === (locale ?? collection.locale),
                  )?.label
                }
                className="@max-[48rem]/header:size-8 @max-[48rem]/header:justify-center @max-[48rem]/header:p-0 @max-[48rem]/header:[&>svg:last-child]:hidden"
              >
                <HugeiconsIcon icon={Globe} aria-hidden="true" />
                <span className="@max-[48rem]/header:sr-only">
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {collection.i18n.locales.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
          {collection && params ? (
            <RepositoryActionButtons
              actions={collection.actions}
              context={{
                type: 'collection',
                name: collection.name,
                path: collection.path,
                data: {
                  label: collection.label,
                  rootPath: collection.rootPath,
                  format: collection.format,
                },
              }}
              coordinates={params}
              disabled={pending}
            />
          ) : null}
          {collection?.subfolders && collection.operations.create ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={_t({ message: 'New folder' })}
                    size="icon"
                    variant="outline"
                    onClick={onNewFolder}
                    disabled={!onNewFolder}
                  >
                    <HugeiconsIcon aria-hidden="true" icon={FolderPlus} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <UiTrans>New folder</UiTrans>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
          <Button
            asChild={Boolean(createHref)}
            disabled={!createHref}
            aria-label={_t({ message: 'New entry' })}
            className="max-md:size-8 max-md:p-0 max-md:has-data-[icon=inline-start]:pl-0 max-md:has-data-[icon=inline-end]:pr-0"
          >
            {createHref ? <Link to={createHref}>{newEntry}</Link> : newEntry}
          </Button>
        </div>
      }
      refreshing={refreshing}
    >
      {collection && params ? (
        <CollectionBreadcrumb collection={collection} params={params} />
      ) : (
        <Skeleton className="h-7 w-32" />
      )}
    </RepositoryPageHeader>
  )
}

function CollectionBreadcrumb({
  collection,
  params,
}: {
  collection: CollectionHeading
  params: Coordinates
}) {
  const folders = getGitRelativePath(collection.path, collection.rootPath)
    .split('/')
    .filter(Boolean)
  const locations = [
    { label: collection.label, path: undefined },
    ...folders.map((label, index) => ({
      label,
      path: joinGitPath(collection.rootPath, ...folders.slice(0, index + 1)),
    })),
  ]
  return (
    <RepositoryBreadcrumb
      items={[
        ...collection.groupTrail.map(({ label }) => ({ label })),
        ...locations.map(({ label, path }) => ({
          label,
          link: (
            <Link
              to="/github/$owner/$repo/$branch/collection/$name"
              params={params}
              search={{ path, locale: collection.locale ?? undefined }}
            >
              {label}
            </Link>
          ),
        })),
      ]}
    />
  )
}
