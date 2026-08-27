import type { ComponentType, ReactNode } from 'react'
import type { ReferenceContext } from './field-types'
import type { JsonObject, JsonValue } from '#/lib/json'

export interface FieldRendererProps {
  disabled: boolean
  field: JsonObject
  id: string
  label: string
  referenceContext?: ReferenceContext
  required: boolean
  value: JsonValue | undefined
  onChange: (value: JsonValue | undefined) => void
  renderField: (control: ReactNode, headerActions?: ReactNode) => ReactNode
}

export type FieldRenderer = ComponentType<FieldRendererProps>

export interface FieldRendererRegistry {
  get: (type: string) => FieldRenderer | undefined
  register: (type: string, renderer: FieldRenderer) => void
  resolve: (type: string) => FieldRenderer
}

export function createFieldRendererRegistry(
  initial: Record<string, FieldRenderer>,
): FieldRendererRegistry {
  const renderers = new Map(Object.entries(initial))

  return {
    get: (type) => renderers.get(type),
    register: (type, renderer) => {
      renderers.set(type, renderer)
    },
    resolve: (type) => {
      const renderer = renderers.get(type) ?? renderers.get('string')
      if (!renderer) {
        throw new Error(
          'The field renderer registry requires a string renderer',
        )
      }
      return renderer
    },
  }
}
