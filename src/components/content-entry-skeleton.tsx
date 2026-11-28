import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import { HugeiconsIcon } from '@hugeicons/react'
import History from '@hugeicons/core-free-icons/HistoryIcon'
import EllipsisVertical from '@hugeicons/core-free-icons/EllipsisVerticalIcon'
import { RepositoryPageHeader } from '#/components/repository-page-header'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Button } from '#/components/ui/button'
import { ButtonGroup } from '#/components/ui/button-group'
import { Field, FieldGroup } from '#/components/ui/field'
import { Skeleton } from '#/components/ui/skeleton'
import { useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { repositoryQueryOptions } from '#/client/queries/repository'
import { findContentSchema } from '#/shared/configuration-content'
import { isContentField } from '#/lib/content-field'

export function ContentEntryFieldsSkeleton({
  fields,
}: {
  fields?: readonly Record<string, unknown>[]
}) {
  const { t: _t } = useUiMessages()
  const visibleFields = fields?.filter((field) => field.hidden !== true)

  if (fields?.length && visibleFields)
    return (
      <FieldGroup
        role="status"
        aria-label={_t({ message: 'Loading editor fields' })}
      >
        {visibleFields.map((field, index) => {
          const list = isContentField(field.list) ? field.list : undefined
          const showSwitcher =
            !field.list &&
            field.type === 'rich-text' &&
            (!isContentField(field.options) || field.options.switcher !== false)
          const showCollapsePlaceholder =
            Boolean(field.list) &&
            (field.type === 'object' || field.type === 'block') &&
            list?.collapsible !== false &&
            (typeof list?.max !== 'number' || list.max > 1)

          return (
            <Field key={String(field.name ?? index)}>
              {field.label !== false ||
              showSwitcher ||
              showCollapsePlaceholder ? (
                <div
                  data-slot="field-header"
                  className="flex min-h-6 items-center justify-between gap-2 text-sm font-medium"
                >
                  <span>
                    {field.label !== false
                      ? String(field.label ?? field.name ?? '')
                      : null}
                  </span>
                  {showSwitcher ? (
                    <Skeleton className="h-6 w-28 rounded-md" />
                  ) : showCollapsePlaceholder ? (
                    <Skeleton className="h-6 w-24 rounded-md" />
                  ) : null}
                </div>
              ) : null}
              {field.description ? (
                <p className="text-sm text-muted-foreground">
                  {String(field.description)}
                </p>
              ) : null}
              <Skeleton
                className={
                  field.list ||
                  ['rich-text', 'text', 'code', 'object', 'block'].includes(
                    String(field.type),
                  )
                    ? 'h-32 w-full'
                    : 'h-8 w-full'
                }
              />
            </Field>
          )
        })}
      </FieldGroup>
    )

  return (
    <FieldGroup
      role="status"
      aria-label={_t({ message: 'Loading editor fields' })}
    >
      <Field>
        <div data-slot="field-header" className="flex min-h-6 items-center">
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-full rounded-lg" />
      </Field>
      <Field>
        <div
          data-slot="field-header"
          className="flex min-h-6 items-center justify-between gap-2"
        >
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
      </Field>
    </FieldGroup>
  )
}

export function ContentEntrySkeleton() {
  const { t: _t } = useUiMessages()
  const params = useParams({ strict: false })
  const client = useQueryClient()
  const repositoryData =
    params.owner && params.repo && params.branch
      ? client.getQueryData(
          repositoryQueryOptions({
            owner: params.owner,
            repo: params.repo,
            branch: params.branch,
          }).queryKey,
        )
      : undefined
  const schema =
    params.name && repositoryData?.configuration?.object
      ? findContentSchema(repositoryData.configuration.object, params.name)
      : undefined
  // Reuse authorized schema labels, never cached file values. Lists and localized
  // structures have data-dependent shapes, so keep their placeholder bounded.
  const fields =
    !schema?.format ||
    schema.list ||
    (isContentField(schema.i18n) && schema.i18n.scheme === 'fields')
      ? undefined
      : Array.isArray(schema.fields)
        ? schema.fields.filter(isContentField)
        : undefined
  return (
    <div className="-m-4 md:-m-6" aria-label={_t({ message: 'Loading entry' })}>
      <RepositoryPageHeader
        actions={
          <>
            <Button disabled>
              <UiTrans>Save</UiTrans>
            </Button>
            <ButtonGroup
              aria-label={_t({ message: 'History and entry actions' })}
            >
              <Button
                aria-label={_t({ message: 'Entry history' })}
                disabled
                size="icon"
                variant="outline"
              >
                <HugeiconsIcon aria-hidden="true" icon={History} />
              </Button>
              <Button
                aria-label={_t({ message: 'Entry actions' })}
                disabled
                size="icon"
                variant="outline"
              >
                <HugeiconsIcon aria-hidden="true" icon={EllipsisVertical} />
              </Button>
            </ButtonGroup>
          </>
        }
      >
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap text-lg font-medium">
            <BreadcrumbItem className="min-w-0 max-w-[38%]">
              {schema ? (
                <span className="truncate">
                  {String(schema.label || schema.name)}
                </span>
              ) : (
                <Skeleton className="h-5 w-20" />
              )}
            </BreadcrumbItem>
            <BreadcrumbSeparator className="shrink-0" />
            <BreadcrumbItem className="min-w-0">
              <Skeleton className="h-5 w-44 max-w-full" />
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </RepositoryPageHeader>
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <ContentEntryFieldsSkeleton fields={fields} />
      </div>
    </div>
  )
}
