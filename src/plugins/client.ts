import type { ErrorTranslation } from '#/i18n/errors'
import type { Messages } from '@lingui/core'
import type { UiMessage } from '#/i18n/message'

import type { z } from 'zod'
import type { QueryClient } from '@tanstack/react-query'
import type { ComponentType, ReactNode } from 'react'
import type { FieldDefinition, FieldViewProps } from '#/fields/definition'
import type { FieldRendererProps } from '#/features/editor/fields/field-renderer-registry'

export type { ErrorTranslation } from '#/i18n/errors'

export type { UiMessage } from '#/i18n/message'

export type { FieldDefinition, FieldViewProps, FieldRendererProps }

export type LazyClientContribution<TProps> = () => Promise<{
  default: ComponentType<TProps>
}>
export interface FieldPlugin {
  definition: FieldDefinition
  editor?: LazyClientContribution<FieldRendererProps>
  view?: LazyClientContribution<FieldViewProps>
  override?: boolean
}

export interface RepositoryPageProps {
  accountId: string
  owner: string
  repo: string
  branch: string
  repoId?: string
  HeaderActions?: ComponentType<{
    children: ReactNode
    placement?: 'actions' | 'toolbar'
  }>
}

export type RepositoryClientContribution = () => Promise<{
  default: ComponentType<RepositoryPageProps>
  /** Browser navigation preload; every server request must still authorize access. */
  preload?: (
    props: Omit<RepositoryPageProps, 'HeaderActions'>,
    queryClient: QueryClient,
  ) => Promise<void>
}>

export interface RepositoryPageContribution {
  /** Project-relative route slug. Defaults to the contribution name; must be unique across plugins and core. */
  path?: string
  /** Admin position: core configuration=10, collaborators=20, actions=30, cache=40. Default=100. */
  order?: number
  label: UiMessage
  /** Optional decorative navigation icon; omitted icons use the default settings glyph. */
  icon?: ComponentType
  /** Optional browser wrapper for navigation interactions; entries render while it loads. */
  navigation?: LazyClientContribution<
    RepositoryPageProps & { children: ReactNode }
  >
  /** Non-interactive status displayed inside this page’s navigation link. */
  badge?: LazyClientContribution<RepositoryPageProps>
  /** Lightweight loading UI shared by route and data-loading states. */
  loading?: ComponentType<Partial<RepositoryPageProps>>
  load: LazyClientContribution<RepositoryPageProps>
}

export type ConfigurationPropertyChange =
  | { action: 'add' | 'replace'; schema: (zod: typeof z) => z.ZodType }
  | { action: 'remove' }

export interface ConfigurationSchemaContribution {
  media?: Readonly<Record<string, ConfigurationPropertyChange>>
}

export interface ConfigurationEditorContributionProps {
  accountId: string
  owner: string
  repo: string
  branch: string
  repoId?: string
  source: string
  disabled: boolean
  onChange: (source: string) => void
  /** Lock editing and Save while a contribution is preparing a replacement. */
  onBusyChange?: (busy: boolean) => void
  /** Default setup alert until the first configuration is saved; retain it when this contribution is unavailable. */
  setup?: ReactNode
  /** Render shared contribution actions in the configuration page header. */
  renderActions?: (content: ReactNode) => ReactNode
}

export interface PluginPageProps {
  /** The original URL query string, without the leading `?`; repeated parameters and exact values are preserved. */
  search: string
}

/**
 * A standalone page served at its explicit absolute path. Pages render for
 * anonymous visitors too; server endpoints must authorize every request.
 */
export interface PluginPageContribution {
  /** Exact absolute path; its top-level segment is reserved for contributed pages. */
  path: string
  title: UiMessage
  loading?: ComponentType
  load: LazyClientContribution<PluginPageProps>
}

export interface AccountSectionContribution {
  /** Pending section body; the host renders its registered label. */
  loading?: ComponentType
  icon?: ComponentType
  id: string
  label: UiMessage
  order?: number
  load: LazyClientContribution<{ accountId: string }>
}

export type TranslationCatalogLoader = () => Promise<{ messages: Messages }>
/** Public, static compiled catalogs; English is the required fallback. */
export type PluginTranslations = { en: TranslationCatalogLoader } & Partial<
  Record<string, TranslationCatalogLoader>
>

export interface ClientPlugin {
  id: string
  translations?: PluginTranslations
  errors?: () => Promise<readonly ErrorTranslation[]>
  pages?: Readonly<Record<string, PluginPageContribution>>
  configurationSchema?: ConfigurationSchemaContribution
  fields?: Readonly<Record<string, FieldPlugin>>
  repositoryPages?: Readonly<Record<string, RepositoryPageContribution>>
  ui?: {
    signInLegal?: LazyClientContribution<Record<string, never>>
    repositorySidebar?: LazyClientContribution<RepositoryPageProps>
    configurationEditor?: LazyClientContribution<ConfigurationEditorContributionProps>
    /** Sections on the account settings page. */
    accountSettings?: readonly AccountSectionContribution[]
    repositoryCollaborators?: RepositoryClientContribution
  }
}
