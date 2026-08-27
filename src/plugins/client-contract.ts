import type { JsonObject, JsonValue } from '#/lib/json'
import type { PLUGIN_API_VERSION } from './contract'

export interface PluginFieldProps {
  field: JsonObject
  /** Stable control id for associating the host application's field label. */
  id?: string
  /** Resolved human-readable label for accessible custom controls. */
  label?: string
  value: JsonValue | undefined
  disabled: boolean
  required: boolean
  onChange: (value: JsonValue | undefined) => void
}

export type PluginFieldComponent = (props: PluginFieldProps) => React.ReactNode

export interface PagesCmsClientPlugin {
  apiVersion: typeof PLUGIN_API_VERSION
  pluginId: string
  fields?: Readonly<Record<string, PluginFieldComponent>>
}

export interface ClientPluginModule {
  default: unknown
}

export function defineClientPlugin(
  contribution: PagesCmsClientPlugin,
): PagesCmsClientPlugin {
  return contribution
}
