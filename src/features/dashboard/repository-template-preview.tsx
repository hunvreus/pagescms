import {
  Trans as UiTrans,
  useLingui as useUiMessages,
} from '@lingui/react/macro'
import type { ReactNode } from 'react'
import type { RepositoryTemplate } from '#/shared/repository-templates'

export function RepositoryTemplatesSection({
  children,
}: {
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium tracking-tight">
        <UiTrans>Create from a template</UiTrans>
      </h2>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">{children}</div>
    </section>
  )
}
export function RepositoryTemplatePreview({
  template,
}: {
  template: RepositoryTemplate
}) {
  const { t: _t } = useUiMessages()

  return (
    <>
      {' '}
      <img
        alt={_t({ message: `Preview for ${template.name}` })}
        className="aspect-video w-full object-cover"
        src={template.thumbnail}
        width={800}
        height={500}
        loading="lazy"
        decoding="async"
      />
      <div className="truncate border-t px-3 py-2 text-sm font-medium">
        {template.name}
      </div>
    </>
  )
}
