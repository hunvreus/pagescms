import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import {
  RepositoryTemplatePreview,
  RepositoryTemplatesSection,
} from './repository-template-preview'
import { REPOSITORY_TEMPLATES } from '#/shared/repository-templates'
import { SearchInput } from '#/components/search-input'
import { Skeleton } from '#/components/ui/skeleton'
import { AppHeaderSkeleton } from '#/features/account/app-header'

export function RepositoryDashboardFrame({
  header,
  history,
  children,
  label,
}: {
  header: React.ReactNode
  history?: React.ReactNode
  children: React.ReactNode
  label?: string
}) {
  return (
    <div className="flex min-h-svh flex-col" aria-label={label}>
      {header}
      <main className="flex w-full flex-1 flex-col justify-center">
        <div className="mx-auto flex w-full max-w-screen-sm flex-col gap-8 p-4 md:p-6">
          {history}
          {children}
        </div>
      </main>
    </div>
  )
}

export function RepositoryDashboardSkeleton() {
  const { t: _t } = useUiMessages()
  return (
    <RepositoryDashboardFrame
      header={<AppHeaderSkeleton />}
      label={_t({ message: 'Loading projects' })}
    >
      <RepositoryDashboardContentSkeleton />
    </RepositoryDashboardFrame>
  )
}

export function RepositoryDashboardContentSkeleton() {
  return (
    <>
      <section className="space-y-4">
        <h1 className="text-lg font-medium tracking-tight">
          <UiTrans>Open a project</UiTrans>
        </h1>
        <RepositorySelectorSkeleton />
      </section>
      <RepositoryTemplatesSection>
        {REPOSITORY_TEMPLATES.map((template) => (
          <button
            disabled
            key={template.repository}
            className="overflow-hidden rounded-md border text-left"
          >
            <RepositoryTemplatePreview template={template} />
          </button>
        ))}
      </RepositoryTemplatesSection>
    </>
  )
}

export function RepositorySelectorSkeleton() {
  const { t: _t } = useUiMessages()

  return (
    <div
      className="flex flex-col gap-4"
      aria-label={_t({ message: 'Loading projects' })}
    >
      <div className="flex w-full items-center gap-2">
        <Skeleton className="h-8 w-32 rounded-md" />
        <SearchInput
          groupClassName="flex-1"
          disabled
          aria-label={_t({ message: 'Search by name' })}
          placeholder={_t({ message: 'Search by name' })}
        />
      </div>
      <RepositoryListSkeleton />
    </div>
  )
}

export function RepositoryListSkeleton() {
  const { t: _t } = useUiMessages()

  return (
    <div
      role="status"
      aria-label={_t({ message: 'Loading repositories' })}
      aria-busy="true"
      className="rounded-md border px-3"
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          className="flex items-center gap-2 border-b py-2 last:border-b-0"
          key={index}
        >
          <Skeleton className="size-5 shrink-0 rounded" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto h-6 w-12" />
        </div>
      ))}
    </div>
  )
}
