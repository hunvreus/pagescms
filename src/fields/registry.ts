import clientDeployment from '#pagescms/deployment/client'

export type { FieldDefinition } from './definition'

export function customFieldDefinition(type: string) {
  return Object.hasOwn(clientDeployment.fields, type)
    ? clientDeployment.fields[type].definition
    : undefined
}
