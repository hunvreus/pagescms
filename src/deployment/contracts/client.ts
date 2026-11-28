import { isUiMessage } from '#/i18n/message'
import { CORE_ROOT_PATHS } from '#/lib/core-route-paths'
import { CORE_REPOSITORY_PATHS } from '#/lib/repository-page-path'
import { assertPluginIds, isRecord } from '#/plugins/identity'
import { BUILTIN_FIELD_TYPES } from '#/fields/definition'
import { DEPLOYMENT_API_VERSION, DeploymentConfigurationError } from './version'
import type {
  ClientPlugin,
  FieldPlugin,
  AccountSectionContribution,
  PluginPageContribution,
  RepositoryPageContribution,
} from '#/plugins/client'

export type ClientUiSlots = Omit<
  NonNullable<ClientPlugin['ui']>,
  'accountSettings'
>

export interface PagesCmsClientDeployment {
  apiVersion: typeof DEPLOYMENT_API_VERSION
  plugins: readonly ClientPlugin[]
  fields: Readonly<Record<string, FieldPlugin>>
  ui: ClientUiSlots
  accountSettings: readonly AccountSectionContribution[]
  repositoryPages: Readonly<Record<string, RepositoryPageContribution>>
  /** Keyed by `<plugin>/<page>`. */
  pages: Readonly<Record<string, PluginPageContribution>>
}

export function definePagesCmsClientDeployment(input: {
  apiVersion: number
  plugins?: readonly ClientPlugin[]
}): PagesCmsClientDeployment {
  if (!isRecord(input) || input.apiVersion !== DEPLOYMENT_API_VERSION)
    throw new DeploymentConfigurationError(
      'Unsupported client deployment API version',
    )
  if (
    Object.keys(input).some((key) => !['apiVersion', 'plugins'].includes(key))
  )
    throw new DeploymentConfigurationError('Unsupported client deployment key')
  if (input.plugins !== undefined && !Array.isArray(input.plugins))
    throw new DeploymentConfigurationError('Plugins must be an array')
  const plugins: readonly ClientPlugin[] = input.plugins ?? []
  assertPluginIds(plugins)
  const fields: Record<string, FieldPlugin> = Object.create(null)
  const ui: ClientUiSlots = {}
  const accountSettings: AccountSectionContribution[] = []
  const pages: Record<string, PluginPageContribution> = Object.create(null)
  const pagePaths = new Set<string>()
  const repositoryPages: Record<string, RepositoryPageContribution> =
    Object.create(null)
  const accountIds = new Set([
    'profile',
    'preferences',
    'security',
    'installations',
    'delete-account',
  ])
  const routes = new Set<string>(CORE_REPOSITORY_PATHS)
  for (const plugin of plugins) {
    if (
      Object.keys(plugin).some(
        (key) =>
          ![
            'id',
            'fields',
            'ui',
            'repositoryPages',
            'pages',
            'configurationSchema',
            'translations',
            'errors',
          ].includes(key),
      )
    )
      throw new DeploymentConfigurationError(
        `Unknown contribution in plugin ${plugin.id}`,
      )
    if (
      plugin.errors !== undefined &&
      (typeof plugin.errors !== 'function' || !plugin.translations)
    )
      throw new DeploymentConfigurationError(
        `Invalid error translations in plugin ${plugin.id}`,
      )
    if (
      plugin.translations !== undefined &&
      (!isRecord(plugin.translations) ||
        typeof plugin.translations.en !== 'function' ||
        Object.entries(plugin.translations).some(
          ([locale, load]) =>
            !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(locale) ||
            typeof load !== 'function',
        ))
    )
      throw new DeploymentConfigurationError(
        `Invalid translations in plugin ${plugin.id}`,
      )
    if (plugin.fields !== undefined && !isRecord(plugin.fields))
      throw new DeploymentConfigurationError('Fields must be a record')
    for (const [name, field] of Object.entries(plugin.fields ?? {})) {
      if (
        !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name) ||
        !isRecord(field) ||
        !isRecord(field.definition)
      )
        throw new DeploymentConfigurationError(`Invalid field ${name}`)
      if (Object.hasOwn(fields, name))
        throw new DeploymentConfigurationError(`Duplicate field ${name}`)
      if (
        (BUILTIN_FIELD_TYPES as readonly string[]).includes(name) &&
        field.override !== true
      )
        throw new DeploymentConfigurationError(
          `Field ${name} requires override: true`,
        )
      if (
        Object.keys(field).some(
          (key) => !['definition', 'editor', 'view', 'override'].includes(key),
        )
      )
        throw new DeploymentConfigurationError(
          `Unknown field contribution ${name}`,
        )
      if (
        (field.editor !== undefined && typeof field.editor !== 'function') ||
        (field.view !== undefined && typeof field.view !== 'function') ||
        (field.override !== undefined && typeof field.override !== 'boolean')
      )
        throw new DeploymentConfigurationError(`Invalid field ${name}`)
      const definition = field.definition
      if (
        Object.keys(definition).some(
          (key) =>
            !['label', 'schema', 'defaultValue', 'read', 'write'].includes(key),
        ) ||
        (definition.label !== undefined &&
          typeof definition.label !== 'string') ||
        ['schema', 'read', 'write'].some(
          (key) =>
            key in definition &&
            typeof definition[key as 'schema' | 'read' | 'write'] !==
              'function',
        )
      )
        throw new DeploymentConfigurationError(
          `Invalid definition for field ${name}`,
        )
      fields[name] = Object.freeze({
        ...field,
        definition: Object.freeze({ ...definition }),
      })
    }
    if (
      plugin.repositoryPages !== undefined &&
      !isRecord(plugin.repositoryPages)
    )
      throw new DeploymentConfigurationError(
        'Repository pages must be a record',
      )
    for (const [name, page] of Object.entries(plugin.repositoryPages ?? {})) {
      if (
        !/^[a-z][a-z0-9-]*$/.test(name) ||
        !isRecord(page) ||
        !isUiMessage(page.label, plugin.id) ||
        typeof page.load !== 'function' ||
        (page.path !== undefined && typeof page.path !== 'string') ||
        (page.order !== undefined &&
          (typeof page.order !== 'number' || !Number.isFinite(page.order))) ||
        (page.navigation !== undefined &&
          typeof page.navigation !== 'function') ||
        (page.badge !== undefined && typeof page.badge !== 'function') ||
        (page.icon !== undefined && typeof page.icon !== 'function') ||
        (page.loading !== undefined && typeof page.loading !== 'function') ||
        Object.keys(page).some(
          (key) =>
            ![
              'label',
              'load',
              'loading',
              'badge',
              'navigation',
              'order',
              'icon',
              'path',
            ].includes(key),
        )
      )
        throw new DeploymentConfigurationError(
          `Invalid repository page ${name}`,
        )
      const path = page.path ?? name
      if (typeof path !== 'string' || !/^[a-z][a-z0-9-]*$/.test(path))
        throw new DeploymentConfigurationError(
          `Invalid repository page path ${String(path)}`,
        )
      if (routes.has(path))
        throw new DeploymentConfigurationError(
          `Conflicting repository page path ${path}`,
        )
      routes.add(path)
      repositoryPages[`${plugin.id}/${name}`] = Object.freeze({ ...page, path })
    }
    if (plugin.pages !== undefined && !isRecord(plugin.pages))
      throw new DeploymentConfigurationError('Pages must be a record')
    for (const [name, page] of Object.entries(plugin.pages ?? {})) {
      if (
        !/^[a-z][a-z0-9-]*$/.test(name) ||
        !isRecord(page) ||
        !isUiMessage(page.title, plugin.id) ||
        typeof page.load !== 'function' ||
        (page.loading !== undefined && typeof page.loading !== 'function') ||
        Object.keys(page).some(
          (key) => !['path', 'title', 'load', 'loading'].includes(key),
        )
      )
        throw new DeploymentConfigurationError(`Invalid page ${name}`)
      if (
        typeof page.path !== 'string' ||
        !/^\/[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)+$/.test(page.path)
      )
        throw new DeploymentConfigurationError(
          `Invalid standalone page path ${String(page.path)}`,
        )
      const prefix = page.path.split('/')[1]
      if (CORE_ROOT_PATHS.includes(prefix))
        throw new DeploymentConfigurationError(
          `Reserved standalone page path ${page.path}`,
        )
      if (
        [...pagePaths].some(
          (path) =>
            path === page.path ||
            path.startsWith(`${page.path}/`) ||
            page.path.startsWith(`${path}/`),
        )
      )
        throw new DeploymentConfigurationError(
          `Conflicting standalone page path ${page.path}`,
        )
      pagePaths.add(page.path)
      pages[`${plugin.id}/${name}`] = Object.freeze({ ...page })
    }
    if (plugin.ui !== undefined && !isRecord(plugin.ui))
      throw new DeploymentConfigurationError(
        'UI contributions must be a record',
      )
    for (const [name, load] of Object.entries(plugin.ui ?? {})) {
      if (name === 'accountSettings') {
        if (!Array.isArray(load))
          throw new DeploymentConfigurationError(
            'Account sections must be an array',
          )
        for (const page of load) {
          if (
            !isRecord(page) ||
            typeof page.id !== 'string' ||
            !/^[a-z][a-z0-9-]*$/.test(page.id) ||
            !isUiMessage(page.label, plugin.id) ||
            typeof page.load !== 'function' ||
            (page.icon !== undefined && typeof page.icon !== 'function') ||
            (page.loading !== undefined &&
              typeof page.loading !== 'function') ||
            (page.order !== undefined &&
              (typeof page.order !== 'number' ||
                !Number.isFinite(page.order))) ||
            Object.keys(page).some(
              (key) =>
                !['id', 'label', 'load', 'loading', 'order', 'icon'].includes(
                  key,
                ),
            )
          )
            throw new DeploymentConfigurationError('Invalid account section')
          if (accountIds.has(page.id))
            throw new DeploymentConfigurationError(
              `Conflicting account section ID ${page.id}`,
            )
          accountIds.add(page.id)
          accountSettings.push(Object.freeze({ ...page }))
        }
        continue
      }
      if (
        ![
          'configurationEditor',
          'repositoryCollaborators',
          'repositorySidebar',
          'signInLegal',
        ].includes(name) ||
        typeof load !== 'function'
      )
        throw new DeploymentConfigurationError(`Invalid UI slot ${name}`)
      if (Object.hasOwn(ui, name))
        throw new DeploymentConfigurationError(
          `Duplicate UI replacement ${name}`,
        )
      Object.assign(ui, { [name]: load })
    }
    if (
      !plugin.translations &&
      [
        ...Object.values(plugin.repositoryPages ?? {}).map(
          (page) => page.label,
        ),
        ...Object.values(plugin.pages ?? {}).map((page) => page.title),
        ...(Array.isArray(plugin.ui?.accountSettings)
          ? plugin.ui.accountSettings
          : []
        ).map((section) => section.label),
      ].some((label) => label !== undefined && typeof label !== 'string')
    )
      throw new DeploymentConfigurationError(
        `Translated labels require catalogs in plugin ${plugin.id}`,
      )
  }
  return Object.freeze({
    apiVersion: DEPLOYMENT_API_VERSION,
    plugins: Object.freeze([...plugins]),
    fields: Object.freeze(fields),
    ui: Object.freeze(ui),
    accountSettings: Object.freeze(
      accountSettings.sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    ),
    repositoryPages: Object.freeze(repositoryPages),
    pages: Object.freeze(pages),
  })
}
