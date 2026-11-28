import { lazy } from 'react'
import clientDeployment from '#pagescms/deployment/client'

export type { FieldViewProps } from '#/fields/definition'

export const customFieldEditors = new Map(
  Object.entries(clientDeployment.fields).flatMap(([name, field]) =>
    field.editor ? [[name, lazy(field.editor)] as const] : [],
  ),
)
export const customFieldViews = new Map(
  Object.entries(clientDeployment.fields).flatMap(([name, field]) =>
    field.view ? [[name, lazy(field.view)] as const] : [],
  ),
)
