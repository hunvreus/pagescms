import { lazy } from 'react'
import type { ComponentType } from 'react'
import type { FieldRendererProps } from './field-renderer-registry'
import type { JsonObject, JsonValue } from '#/lib/json'

export interface FieldViewProps {
  field: JsonObject
  value: JsonValue | undefined
}

const editors = import.meta.glob<{
  default?: ComponentType<FieldRendererProps>
  EditComponent?: ComponentType<FieldRendererProps>
}>('../../../fields/custom/*/edit-component.tsx')
const views = import.meta.glob<{
  default?: ComponentType<FieldViewProps>
  ViewComponent?: ComponentType<FieldViewProps>
}>('../../../fields/custom/*/view-component.tsx')

function components<T>(
  modules: Record<
    string,
    () => Promise<{ default?: ComponentType<T> } & Record<string, unknown>>
  >,
  exportName: string,
) {
  return new Map(
    Object.entries(modules).map(([path, load]) => [
      path.split('/').at(-2)!,
      lazy(async () => {
        const module = await load()
        const component =
          module.default ?? (module[exportName] as ComponentType<T> | undefined)
        if (!component)
          throw new Error(
            `Custom field ${path} must export ${exportName} or default`,
          )
        return { default: component }
      }),
    ]),
  )
}

export const customFieldEditors = components<FieldRendererProps>(
  editors,
  'EditComponent',
)
export const customFieldViews = components<FieldViewProps>(
  views,
  'ViewComponent',
)
